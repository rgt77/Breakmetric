import fs from "node:fs";
import path from "node:path";
import {
  evidenceBreakdown,
  estimateModeledValue,
  median
} from "./lib/valuation-model.mjs";

const root=process.cwd();
const args=process.argv.slice(2);
const check=args.includes("--check");
const valueAfter=flag=>{
  const i=args.indexOf(flag);
  return i>=0?args[i+1]:null;
};
const configPath=valueAfter("--config")||
  "data/collection/continuous-market-collector-config-v1.json";
const outputPath=valueAfter("--output")||
  "data/validation/automated-valuation-backtest-v1.json";
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),"utf8"));
const stable=value=>JSON.stringify(value,null,2)+"\n";
const round=(value,digits=8)=>{
  if(value===null||value===undefined||!Number.isFinite(Number(value))) return null;
  const factor=10**digits;
  return Math.round(Number(value)*factor)/factor;
};

const config=read(configPath);
const sources=config.task_sources||{};
const provenance=read(sources.provenance);
const inventory=read(sources.inventory);
const insertMap=read(sources.insert_odds_mapping);
const observations=read(config.observation_file);

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

function resolveCanonicalTarget(entry){
  const category=categoryFor(entry);
  const matches=(inventory.cards||[]).filter(card=>
    card.team===entry.team &&
    card.category===category &&
    card.set===entry.set &&
    card.canonical_variants?.includes(entry.parallel) &&
    (!entry.player||card.subjects?.includes(entry.player))
  );
  if(matches.length!==1){
    throw new Error(
      "Cannot resolve canonical contribution to one eligible card: "+
      entry.card_id+" -> "+matches.length
    );
  }
  const card=matches[0];
  const derived=read(entry.derived_ev_file);
  const value=Number(derived.market_value_usd);
  if(!(value>0)){
    throw new Error("Canonical market value missing: "+entry.card_id);
  }
  const taskId=[
    config.product_id,
    config.format_id,
    entry.team,
    category,
    entry.set,
    String(card.card_number),
    entry.parallel
  ].join("::");
  return {
    task_id:taskId,
    card_id:entry.card_id,
    team:entry.team,
    category,
    set:entry.set,
    card_number:String(card.card_number),
    subjects:[entry.player].filter(Boolean),
    subject:entry.player||null,
    parallel:entry.parallel,
    evidence_class:"canonical-realized-sale",
    source:"canonical-realized-sale-market-record",
    value:round(value)
  };
}

const canonicalEvidence=(provenance.entries||[]).map(resolveCanonicalTarget);
const providerEvidence=Object.entries(observations.entries||{})
  .filter(([,row])=>
    row.exact_identity===true &&
    row.status==="exact-current-price" &&
    Number(row.raw_price_usd)>0
  )
  .map(([taskId,row])=>({
    task_id:taskId,
    team:row.team,
    category:row.category,
    set:row.set,
    card_number:String(row.card_number||""),
    subjects:[...(row.subjects||[])],
    subject:row.subjects?.[0]||null,
    parallel:row.parallel,
    evidence_class:"exact-provider-current-price",
    source:row.source,
    value:round(Number(row.raw_price_usd))
  }));

function metricSummary(rows=[]){
  const predicted=rows.filter(row=>row.predicted_value_usd!==null);
  const absErrors=predicted.map(row=>row.absolute_error_usd);
  const apes=predicted
    .map(row=>row.absolute_percentage_error_pct)
    .filter(Number.isFinite);
  const signed=predicted.map(row=>row.signed_error_usd);
  return {
    holdout_count:rows.length,
    predicted_count:predicted.length,
    unknown_count:rows.length-predicted.length,
    prediction_coverage_pct:rows.length
      ?round(predicted.length/rows.length*100,4)
      :0,
    mae_usd:predicted.length
      ?round(absErrors.reduce((a,b)=>a+b,0)/predicted.length)
      :null,
    median_absolute_error_usd:absErrors.length
      ?round(median(absErrors))
      :null,
    mean_absolute_percentage_error_pct:apes.length
      ?round(apes.reduce((a,b)=>a+b,0)/apes.length,4)
      :null,
    median_absolute_percentage_error_pct:apes.length
      ?round(median(apes),4)
      :null,
    mean_signed_error_usd:signed.length
      ?round(signed.reduce((a,b)=>a+b,0)/signed.length)
      :null
  };
}

const holdouts=[];
for(const target of canonicalEvidence){
  const training=[
    ...canonicalEvidence.filter(row=>row.task_id!==target.task_id),
    ...providerEvidence.filter(row=>row.task_id!==target.task_id)
  ];
  const modeled=estimateModeledValue(target,training);
  const predicted=modeled.value===null?null:round(modeled.value);
  const actual=round(target.value);
  const signed=predicted===null?null:round(predicted-actual);
  const absolute=signed===null?null:round(Math.abs(signed));
  const ape=
    absolute===null||!(actual>0)
      ?null
      :round(absolute/actual*100,4);
  holdouts.push({
    task_id:target.task_id,
    card_id:target.card_id,
    team:target.team,
    category:target.category,
    set:target.set,
    card_number:target.card_number,
    subject:target.subject,
    parallel:target.parallel,
    actual_market_value_usd:actual,
    predicted_value_usd:predicted,
    valuation_tier:modeled.tier,
    valuation_basis:modeled.basis,
    confidence:modeled.confidence,
    training_evidence_count:modeled.supporting_evidence.length,
    training_evidence_breakdown:
      evidenceBreakdown(modeled.supporting_evidence),
    signed_error_usd:signed,
    absolute_error_usd:absolute,
    absolute_percentage_error_pct:ape
  });
}

const groupBy=(keyFn)=>{
  const map={};
  for(const row of holdouts){
    const key=String(keyFn(row));
    (map[key]||(map[key]=[])).push(row);
  }
  return Object.fromEntries(
    Object.entries(map)
      .sort(([a],[b])=>a.localeCompare(b))
      .map(([key,rows])=>[key,metricSummary(rows)])
  );
};

const uniqueTeams=[...new Set(holdouts.map(row=>row.team))].sort();
const uniqueSubjects=[...new Set(holdouts.map(row=>row.subject).filter(Boolean))].sort();
const tierCount={C:0,D:0,E:0};
for(const row of holdouts) tierCount[row.valuation_tier]=(tierCount[row.valuation_tier]||0)+1;

const largestErrors=holdouts
  .filter(row=>row.absolute_percentage_error_pct!==null)
  .sort((a,b)=>
    b.absolute_percentage_error_pct-a.absolute_percentage_error_pct ||
    b.absolute_error_usd-a.absolute_error_usd ||
    a.task_id.localeCompare(b.task_id)
  )
  .slice(0,10)
  .map(row=>({
    task_id:row.task_id,
    subject:row.subject,
    category:row.category,
    parallel:row.parallel,
    actual_market_value_usd:row.actual_market_value_usd,
    predicted_value_usd:row.predicted_value_usd,
    valuation_tier:row.valuation_tier,
    valuation_basis:row.valuation_basis,
    absolute_error_usd:row.absolute_error_usd,
    absolute_percentage_error_pct:row.absolute_percentage_error_pct
  }));

const output={
  schema_version:1,
  model:"automated-valuation-backtest-v1",
  product_id:config.product_id,
  format_id:config.format_id,
  generated_from_provenance_at:provenance.generated_at||null,
  methodology:"leave-one-out holdout over canonical realized-sale market values",
  leakage_control:[
    "The target canonical observation is removed from training evidence before prediction.",
    "An exact provider observation with the same task_id is also removed from training evidence.",
    "The same shared C/D valuation function used by the candidate generator is used by the backtest."
  ],
  population:{
    canonical_holdout_count:holdouts.length,
    team_count:uniqueTeams.length,
    teams:uniqueTeams,
    subject_count:uniqueSubjects.length,
    subjects:uniqueSubjects,
    provider_training_observation_count:providerEvidence.length,
    generalization_warning:
      uniqueTeams.length<3
        ?"Current canonical holdouts are concentrated in fewer than three teams; this is a baseline calibration result, not release-wide proof of model accuracy."
        :null
  },
  summary:{
    ...metricSummary(holdouts),
    tier_count:tierCount
  },
  by_tier:groupBy(row=>row.valuation_tier),
  by_basis:groupBy(row=>row.valuation_basis),
  by_category:groupBy(row=>row.category),
  largest_percentage_errors:largestErrors,
  holdouts
};

const expected=stable(output);
const target=path.resolve(root,outputPath);
if(check){
  const current=fs.existsSync(target)?fs.readFileSync(target,"utf8"):"";
  if(current!==expected){
    console.error(JSON.stringify({
      result:"fail",
      reason:"valuation backtest artifact is stale",
      expected_summary:output.summary,
      population:output.population
    },null,2));
    process.exit(1);
  }
  console.log(JSON.stringify({
    result:"pass",
    output:outputPath,
    summary:output.summary,
    population:output.population
  },null,2));
}else{
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,expected);
  console.log(JSON.stringify({
    result:"written",
    output:outputPath,
    summary:output.summary,
    population:output.population
  },null,2));
}
