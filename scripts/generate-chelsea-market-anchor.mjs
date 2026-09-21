import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const product="2026-topps-chrome-premier-league";
const check=process.argv.includes("--check");
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),"utf8"));
const stable=value=>JSON.stringify(value,null,2)+"\n";
const round=value=>Math.round(Number(value)*1e8)/1e8;
const median=values=>{
  const xs=values.filter(Number.isFinite).sort((a,b)=>a-b);
  if(!xs.length) return null;
  const m=Math.floor(xs.length/2);
  return xs.length%2?xs[m]:(xs[m-1]+xs[m])/2;
};

const provenance=read(
  "data/derived/"+product+"-hobby-ev-contribution-provenance-v1.json"
);
const insertMap=read(
  "data/mappings/"+product+"-hobby-insert-odds-map.json"
);
const insertSets=new Set(
  (insertMap.mappings||[]).flatMap(row=>
    row.checklist_sections||[row.checklist_section]
  ).filter(Boolean)
);
const categoryFor=entry=>
  entry.set==="Base Cards"
    ? "base_parallels"
    : insertSets.has(entry.set)
      ? "inserts"
      : "autographs";

const observations=[];
for(const entry of provenance.entries||[]){
  if(entry.team!=="Chelsea") continue;
  const derived=read(entry.derived_ev_file);
  const value=Number(derived.market_value_usd);
  if(!(value>0)){
    throw new Error("Chelsea EV derivation lacks positive market value: "+entry.card_id);
  }
  observations.push({
    subject:entry.player,
    category:categoryFor(entry),
    value
  });
}

const minCategoryObservations=3;
const categories={};
for(const category of ["base_parallels","autographs","inserts"]){
  const values=observations
    .filter(row=>row.category===category)
    .map(row=>row.value);
  const m=median(values);
  categories[category]={
    observation_count:values.length,
    median_market_value_usd:m===null?null:round(m),
    eligible_as_fallback:values.length>=minCategoryObservations
  };
}

const subjects={};
for(const subject of [...new Set(observations.map(row=>row.subject))].sort()){
  const rows=observations.filter(row=>row.subject===subject);
  const allValues=rows.map(row=>row.value);
  subjects[subject]={
    all:{
      observation_count:allValues.length,
      median_market_value_usd:round(median(allValues))
    }
  };
  for(const category of ["base_parallels","inserts","autographs"]){
    const values=rows.filter(row=>row.category===category).map(row=>row.value);
    if(!values.length) continue;
    subjects[subject][category]={
      observation_count:values.length,
      median_market_value_usd:round(median(values))
    };
  }
}

const teamValues=observations.map(row=>row.value);
const anchor={
  schema_version:1,
  product_id:product,
  format_id:"hobby",
  team:"Chelsea",
  generated_at:"2026-09-21",
  model:"chelsea-market-anchor-v1",
  source_provenance:
    "data/derived/"+product+"-hobby-ev-contribution-provenance-v1.json",
  definition:
    "Median market-value observations from currently valued Chelsea EV contributions. These anchors exist only to prioritize research; they are not market values for unvalued slots.",
  rules:[
    "Same-subject same-category medians are preferred.",
    "If the subject has no same-category values, a same-subject cross-category median may be used with lower confidence.",
    "A category-wide median is eligible as fallback only with at least three observed valued contributions.",
    "Otherwise the Chelsea-wide median is the fallback.",
    "For multi-subject cards, the highest available subject anchor is used for prioritization so a known high-value subject is not diluted by an unanchored co-subject.",
    "Anchor values are generated from current committed Chelsea EV source files.",
    "An anchor is a ranking proxy input, never a predicted market value."
  ],
  minimum_category_observations_for_fallback:minCategoryObservations,
  team:{
    observation_count:teamValues.length,
    median_market_value_usd:round(median(teamValues))
  },
  categories,
  subjects
};

const target=
  "data/derived/"+product+"-hobby-chelsea-market-anchor-v1.json";
const output=stable(anchor);
if(check){
  if(!fs.existsSync(path.join(root,target)) ||
     fs.readFileSync(path.join(root,target),"utf8")!==output){
    throw new Error("Generated file is stale: "+target);
  }
}else{
  fs.writeFileSync(path.join(root,target),output);
}

console.log(JSON.stringify({
  result:check?"pass":"written",
  observation_count:teamValues.length,
  team_median_market_value_usd:anchor.team.median_market_value_usd,
  categories:anchor.categories,
  subject_count:Object.keys(anchor.subjects).length
},null,2));
