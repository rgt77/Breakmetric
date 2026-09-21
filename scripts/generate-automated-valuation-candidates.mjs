import fs from "node:fs";
import path from "node:path";
import {buildUnvaluedCollectionTasks} from "./lib/ev-slot-inventory.mjs";

const root=process.cwd();
const args=process.argv.slice(2);
const valueAfter=flag=>{
  const i=args.indexOf(flag);
  return i>=0?args[i+1]:null;
};
const configPath=valueAfter("--config")||
  "data/collection/continuous-market-collector-config-v1.json";
const outputOverride=valueAfter("--output");
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),"utf8"));
const stable=value=>JSON.stringify(value,null,2)+"\n";
const round=value=>Math.round(Number(value)*1e8)/1e8;
const median=values=>{
  const xs=values.filter(Number.isFinite).sort((a,b)=>a-b);
  if(!xs.length) return null;
  const m=Math.floor(xs.length/2);
  return xs.length%2?xs[m]:(xs[m-1]+xs[m])/2;
};

const config=read(configPath);
const observations=read(config.observation_file);
const sources=config.task_sources||{};
const provenance=read(sources.provenance);
const insertMap=read(sources.insert_odds_mapping);
const taskState=buildUnvaluedCollectionTasks({
  product:config.product_id,
  inventory:read(sources.inventory),
  provenance,
  baseOdds:read(sources.base_odds),
  insertMap,
  autoMap:read(sources.autograph_odds_mapping),
  inserts:read(sources.insert_checklist),
  mainAutos:read(sources.main_autographs),
  specialAutos:read(sources.special_autographs),
  format:read(sources.format)
});

const insertSets=new Set(
  (insertMap.mappings||[])
    .flatMap(row=>row.checklist_sections||[row.checklist_section])
    .filter(Boolean)
);
const categoryFor=entry=>
  entry.set==="Base Cards"
    ?"base_parallels"
    :insertSets.has(entry.set)
      ?"inserts"
      :"autographs";

const evidence=[];
for(const entry of provenance.entries||[]){
  const derived=read(entry.derived_ev_file);
  const value=Number(derived.market_value_usd);
  if(value>0){
    evidence.push({
      source:"canonical-realized-sale-market-record",
      team:entry.team,
      subject:entry.player,
      category:categoryFor(entry),
      value
    });
  }
}
for(const observation of Object.values(observations.entries||{})){
  if(
    observation.exact_identity===true &&
    observation.status==="exact-current-price" &&
    Number(observation.raw_price_usd)>0
  ){
    evidence.push({
      source:observation.source,
      team:observation.team,
      subject:observation.subjects?.[0]||null,
      category:observation.category,
      value:Number(observation.raw_price_usd)
    });
  }
}

const candidates=[];
const counts={A:0,B:0,C:0,D:0,E:0};
let candidateEvTotal=0;
for(const task of taskState.tasks||[]){
  const exact=observations.entries?.[task.task_id];
  let tier="E",basis="unknown",value=null,confidence="none";
  let observationCount=0;

  if(
    exact?.exact_identity===true &&
    exact?.status==="exact-current-price" &&
    Number(exact.raw_price_usd)>0
  ){
    tier="B";
    basis="exact-provider-current-price";
    value=Number(exact.raw_price_usd);
    confidence="medium";
    observationCount=1;
  }else{
    const subject=task.subjects?.[0]||null;
    const subjectValues=evidence
      .filter(row=>
        row.team===task.team &&
        row.subject===subject &&
        row.category===task.category
      )
      .map(row=>row.value);

    if(subjectValues.length){
      tier="C";
      basis="same-subject-same-category-model";
      value=median(subjectValues);
      confidence="low";
      observationCount=subjectValues.length;
    }else{
      const teamCategoryValues=evidence
        .filter(row=>row.team===task.team&&row.category===task.category)
        .map(row=>row.value);
      if(teamCategoryValues.length>=3){
        tier="D";
        basis="team-category-model";
        value=median(teamCategoryValues);
        confidence="very-low";
        observationCount=teamCategoryValues.length;
      }else{
        const productCategoryValues=evidence
          .filter(row=>row.category===task.category)
          .map(row=>row.value);
        if(productCategoryValues.length>=3){
          tier="D";
          basis="product-category-model";
          value=median(productCategoryValues);
          confidence="very-low";
          observationCount=productCategoryValues.length;
        }
      }
    }
  }

  const estimate=value===null?null:round(value);
  const ev=estimate===null
    ?null
    :round(estimate*Number(task.expected_copies_per_case||0));
  if(ev!==null) candidateEvTotal+=ev;
  counts[tier]=(counts[tier]||0)+1;

  candidates.push({
    task_id:task.task_id,
    rank:task.rank,
    team:task.team,
    category:task.category,
    set:task.set,
    card_number:task.card_number,
    subjects:task.subjects,
    parallel:task.parallel,
    expected_copies_per_case:task.expected_copies_per_case,
    valuation_tier:tier,
    valuation_basis:basis,
    confidence,
    market_value_estimate_usd:estimate,
    evidence_observation_count:observationCount,
    candidate_ev_contribution_usd:ev,
    canonical_ev_eligible:false,
    canonical_exclusion_reason:
      tier==="B"
        ?"Provider current prices are kept separate from realized-sale canonical EV until an explicit promotion policy is enabled."
        :tier==="C"||tier==="D"
          ?"Modeled values never silently enter canonical EV."
          :"No usable valuation evidence."
  });
}

const output={
  schema_version:1,
  model:"automated-valuation-candidates-v1",
  product_id:config.product_id,
  format_id:config.format_id,
  generated_at:observations.generated_at||null,
  methodology:"data/methodology/automated-market-valuation-v1.json",
  canonical_ev_mutated:false,
  summary:{
    eligible_slot_count:taskState.eligible_slot_count,
    canonical_valued_slot_count:taskState.valued_slot_count,
    candidate_count:candidates.length,
    tier_count:counts,
    exact_provider_price_count:counts.B,
    modeled_candidate_count:counts.C+counts.D,
    unknown_count:counts.E,
    candidate_ev_total_usd:round(candidateEvTotal)
  },
  candidates
};

const outputPath=outputOverride||config.automated_valuation_file;
fs.writeFileSync(path.resolve(root,outputPath),stable(output));
console.log(JSON.stringify({
  result:"written",
  output:outputPath,
  summary:output.summary
},null,2));
