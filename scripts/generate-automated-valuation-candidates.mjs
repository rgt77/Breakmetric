import fs from "node:fs";
import path from "node:path";
import {buildUnvaluedCollectionTasks} from "./lib/ev-slot-inventory.mjs";
import {
  evidenceBreakdown,
  estimateModeledValue
} from "./lib/valuation-model.mjs";

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
const config=read(configPath);
const observations=read(config.observation_file);
const confidencePolicy=
  read("data/methodology/valuation-confidence-gates-v1.json");
const backtestManifest=
  read("data/validation/step-887.json");
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

const candidates=[];
const counts={A:0,B:0,C:0,D:0,E:0};
let directProviderEvTotal=0;
let modeledEvTotal=0;
let rawModeledCandidateCount=0;
let suppressedModeledCandidateCount=0;
for(const task of taskState.tasks||[]){
  const exact=observations.entries?.[task.task_id];
  let tier="E",basis="unknown",value=null,confidence="none";
  let supportingEvidence=[];
  let proposedTier=null;
  let proposedBasis=null;
  let proposedConfidence=null;
  let confidenceGate={
    applies:false,
    passed:false,
    status:"not-applicable",
    reasons:[]
  };

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
    const modeled=estimateModeledValue(
      task,
      evidence,
      {
        gatePolicy:confidencePolicy,
        calibration:backtestManifest.baseline
      }
    );
    tier=modeled.tier;
    basis=modeled.basis;
    value=modeled.value;
    confidence=modeled.confidence;
    supportingEvidence=modeled.supporting_evidence;
    proposedTier=modeled.proposed_tier||null;
    proposedBasis=modeled.proposed_basis||null;
    proposedConfidence=modeled.proposed_confidence||null;
    confidenceGate=modeled.confidence_gate||confidenceGate;
    if(proposedTier==="C"||proposedTier==="D"){
      rawModeledCandidateCount++;
      if(confidenceGate.status==="failed"){
        suppressedModeledCandidateCount++;
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
    proposed_valuation_tier:proposedTier,
    proposed_valuation_basis:proposedBasis,
    proposed_confidence:proposedConfidence,
    confidence_gate_status:confidenceGate.status,
    confidence_gate_reasons:[...(confidenceGate.reasons||[])],
    model_candidate_suppressed:
      confidenceGate.status==="failed",
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
    raw_modeled_candidate_count:rawModeledCandidateCount,
    suppressed_modeled_candidate_count:
      suppressedModeledCandidateCount,
    unknown_count:counts.E,
    confidence_gate:{
      policy:"data/methodology/valuation-confidence-gates-v1.json",
      calibration_source:"data/validation/step-887.json",
      calibration_status:
        suppressedModeledCandidateCount>0 &&
        counts.C+counts.D===0
          ?"blocking"
          :"mixed-or-passing"
    },
    direct_provider_candidate_ev_total_usd:round(directProviderEvTotal),
    modeled_candidate_ev_total_usd:round(modeledEvTotal),
    noncanonical_candidate_ev_total_usd:
      round(directProviderEvTotal+modeledEvTotal),
    aggregate_semantics:
      "All candidate EV totals are non-canonical. Tier B is direct provider evidence. Tier C/D contribute modeled EV only after confidence gates pass; gated model candidates fall back to Tier E/unknown."
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
