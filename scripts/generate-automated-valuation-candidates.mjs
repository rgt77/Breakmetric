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
      evidence_class:"canonical-realized-sale",
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
      evidence_class:"exact-provider-current-price",
      source:observation.source,
      team:observation.team,
      subject:observation.subjects?.[0]||null,
      category:observation.category,
      value:Number(observation.raw_price_usd)
    });
  }
}

const evidenceBreakdown=rows=>({
  total_count:rows.length,
  canonical_realized_sale_count:
    rows.filter(row=>row.evidence_class==="canonical-realized-sale").length,
  exact_provider_current_price_count:
    rows.filter(row=>row.evidence_class==="exact-provider-current-price").length
});

const candidates=[];
const counts={A:0,B:0,C:0,D:0,E:0};
let directProviderEvTotal=0;
let modeledEvTotal=0;
for(const task of taskState.tasks||[]){
  const exact=observations.entries?.[task.task_id];
  let tier="E",basis="unknown",value=null,confidence="none";
  let supportingEvidence=[];

  if(
    exact?.exact_identity===true &&
    exact?.status==="exact-current-price" &&
    Number(exact.raw_price_usd)>0
  ){
    tier="B";
    basis="exact-provider-current-price";
    value=Number(exact.raw_price_usd);
    confidence="medium";
    supportingEvidence=[{
      evidence_class:"exact-provider-current-price",
      source:exact.source,
      team:task.team,
      subject:task.subjects?.[0]||null,
      category:task.category,
      value:Number(exact.raw_price_usd)
    }];
  }else{
    const subject=task.subjects?.[0]||null;
    const subjectEvidence=evidence
      .filter(row=>
        row.team===task.team &&
        row.subject===subject &&
        row.category===task.category
      );

    if(subjectEvidence.length){
      tier="C";
      basis="same-subject-same-category-model";
      supportingEvidence=subjectEvidence;
      value=median(subjectEvidence.map(row=>row.value));
      confidence="low";
    }else{
      const teamCategoryEvidence=evidence
        .filter(row=>row.team===task.team&&row.category===task.category);
      if(teamCategoryEvidence.length>=3){
        tier="D";
        basis="team-category-model";
        supportingEvidence=teamCategoryEvidence;
        value=median(teamCategoryEvidence.map(row=>row.value));
        confidence="very-low";
      }else{
        const productCategoryEvidence=evidence
          .filter(row=>row.category===task.category);
        if(productCategoryEvidence.length>=3){
          tier="D";
          basis="product-category-model";
          supportingEvidence=productCategoryEvidence;
          value=median(productCategoryEvidence.map(row=>row.value));
          confidence="very-low";
        }
      }
    }
  }

  const estimate=value===null?null:round(value);
  const ev=estimate===null
    ?null
    :round(estimate*Number(task.expected_copies_per_case||0));
  if(ev!==null){
    if(tier==="B") directProviderEvTotal+=ev;
    if(tier==="C"||tier==="D") modeledEvTotal+=ev;
  }
  counts[tier]=(counts[tier]||0)+1;
  const breakdown=evidenceBreakdown(supportingEvidence);
  const valuationClass=
    tier==="B"
      ?"direct-provider"
      :tier==="C"||tier==="D"
        ?"modeled"
        :"unknown";

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
    valuation_class:valuationClass,
    direct_market_observation:tier==="B",
    modeled_value:tier==="C"||tier==="D",
    confidence,
    market_value_estimate_usd:estimate,
    evidence_observation_count:breakdown.total_count,
    evidence_breakdown:breakdown,
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
    direct_provider_candidate_ev_total_usd:round(directProviderEvTotal),
    modeled_candidate_ev_total_usd:round(modeledEvTotal),
    noncanonical_candidate_ev_total_usd:
      round(directProviderEvTotal+modeledEvTotal),
    aggregate_semantics:
      "All candidate EV totals are non-canonical. Tier B is direct provider evidence; Tier C/D are modeled estimates and must remain separately presented."
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
