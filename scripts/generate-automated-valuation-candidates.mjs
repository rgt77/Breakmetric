import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const args=process.argv.slice(2);
const valueAfter=flag=>{
  const i=args.indexOf(flag);
  return i>=0?args[i+1]:null;
};
const configPath=valueAfter("--config")||
  "data/collection/continuous-market-collector-config-v1.json";
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
const queue=read(config.queue_file);
const observations=read(config.observation_file);
const provenance=read(
  "data/derived/"+config.product_id+"-hobby-ev-contribution-provenance-v1.json"
);
const insertMap=read(
  "data/mappings/"+config.product_id+"-hobby-insert-odds-map.json"
);
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
  if(entry.team!=="Chelsea") continue;
  const derived=read(entry.derived_ev_file);
  const value=Number(derived.market_value_usd);
  if(value>0){
    evidence.push({
      source:"canonical-realized-sale-market-record",
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
      subject:observation.subjects?.[0]||null,
      category:observation.category,
      value:Number(observation.raw_price_usd)
    });
  }
}

const candidates=[];
const counts={A:0,B:0,C:0,D:0,E:0};
let candidateEvTotal=0;
for(const task of queue.tasks||[]){
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
      .filter(row=>row.subject===subject&&row.category===task.category)
      .map(row=>row.value);
    if(subjectValues.length){
      tier="C";
      basis="same-subject-same-category-model";
      value=median(subjectValues);
      confidence="low";
      observationCount=subjectValues.length;
    }else{
      const categoryValues=evidence
        .filter(row=>row.category===task.category)
        .map(row=>row.value);
      if(categoryValues.length>=3){
        tier="D";
        basis="team-category-model";
        value=median(categoryValues);
        confidence="very-low";
        observationCount=categoryValues.length;
      }else{
        const teamValues=evidence.map(row=>row.value);
        if(teamValues.length>=3){
          tier="D";
          basis="team-wide-model";
          value=median(teamValues);
          confidence="very-low";
          observationCount=teamValues.length;
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
  generated_at:new Date().toISOString(),
  methodology:"data/methodology/automated-market-valuation-v1.json",
  canonical_ev_mutated:false,
  summary:{
    candidate_count:candidates.length,
    tier_count:counts,
    exact_provider_price_count:counts.B,
    modeled_candidate_count:counts.C+counts.D,
    unknown_count:counts.E,
    candidate_ev_total_usd:round(candidateEvTotal)
  },
  candidates
};

fs.writeFileSync(
  path.join(root,config.automated_valuation_file),
  stable(output)
);
console.log(JSON.stringify({
  result:"written",
  output:config.automated_valuation_file,
  summary:output.summary
},null,2));
