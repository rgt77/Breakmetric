import fs from "node:fs";
import path from "node:path";
import {
  csvPriceUsd,
  exactProviderIdentity,
  indexProviderRowsByCardNumber,
  mergeObservation,
  normalizeText,
  parseCsv
} from "./lib/market-automation.mjs";
import {buildUnvaluedCollectionTasks} from "./lib/ev-slot-inventory.mjs";
import {
  evaluateSoakAndAcceptance,
  loadCollectorOps,
  persistCollectorOps,
  providerCredentialTransition,
  qualityGate,
  recordCollectorRun,
  recordException,
  recordPriceHistory,
  recordQuarantine,
  recomputeCoverage,
  recomputeHealth,
  resolveException,
  runFairnessSummary,
  withRetry
} from "./lib/collector-telemetry.mjs";

const root=process.cwd();
const args=process.argv.slice(2);
const valueAfter=flag=>{
  const i=args.indexOf(flag);
  return i>=0 ? args[i+1] : null;
};
const configPath=valueAfter("--config")||
  "data/collection/continuous-market-collector-config-v1.json";
const fixturePath=valueAfter("--fixture");
const nowArg=valueAfter("--now");
const now=nowArg ? new Date(nowArg) : new Date();
if(Number.isNaN(now.getTime())) throw new Error("Invalid --now timestamp");
const nowIso=now.toISOString();

const readJson=file=>JSON.parse(fs.readFileSync(path.join(root,file),"utf8"));
const stable=value=>JSON.stringify(value,null,2)+"\n";
const config=readJson(configPath);
const store=readJson(config.observation_file);
const sources=config.task_sources||{};
const provenance=readJson(sources.provenance);
const canonicalEvCount=Number(provenance.summary?.contribution_count||0);
const taskState=buildUnvaluedCollectionTasks({
  product:config.product_id,
  inventory:readJson(sources.inventory),
  provenance,
  baseOdds:readJson(sources.base_odds),
  insertMap:readJson(sources.insert_odds_mapping),
  autoMap:readJson(sources.autograph_odds_mapping),
  inserts:readJson(sources.insert_checklist),
  mainAutos:readJson(sources.main_autographs),
  specialAutos:readJson(sources.special_autographs),
  format:readJson(sources.format)
});
const ops=loadCollectorOps(root,config);
const urlEnv=config.bulk_lane?.csv_url_env||"SPORTSCARDSPRO_CSV_URL";
const csvUrl=process.env[urlEnv]||"";
const credentialTransition=providerCredentialTransition(ops,{
  lane:"bulk",
  credentialPresent:Boolean(fixturePath||csvUrl),
  now:nowIso,
  missingReason:urlEnv+" is missing."
});

if(!fixturePath&&!csvUrl){
  if(credentialTransition){
    recomputeCoverage(ops,taskState,store,nowIso);
    recomputeHealth(ops,config,nowIso);
    evaluateSoakAndAcceptance(ops,config,nowIso,canonicalEvCount);
    persistCollectorOps(root,config,ops);
  }
  console.log(JSON.stringify({
    result:"disabled-missing-csv-url",
    operational_health:ops.state.health,
    credential_env:urlEnv,
    message:"Daily bulk lane is installed but cannot collect live provider data until the CSV URL secret is configured."
  },null,2));
  process.exit(0);
}

const retry=config.retry||{};
const retryStatuses=new Set((retry.retry_http_statuses||[]).map(Number));
let retryCount=0;
const retryOptions={
  maxAttempts:Number(retry.max_attempts||3),
  baseDelayMs:Number(retry.base_delay_ms||750),
  maxDelayMs:Number(retry.max_delay_ms||8000),
  shouldRetry:error=>{
    const status=Number(error?.http_status);
    return Number.isFinite(status)?retryStatuses.has(status):true;
  },
  onRetry:()=>{retryCount++;}
};

let csvText="";
if(fixturePath){
  csvText=fs.readFileSync(path.resolve(root,fixturePath),"utf8");
}else{
  csvText=await withRetry(async()=>{
    const response=await fetch(csvUrl,{
      headers:{
        accept:"text/csv,*/*;q=0.8",
        "user-agent":"BreakMetric-market-collector/2.0"
      }
    });
    if(!response.ok){
      const error=new Error("CSV HTTP "+response.status);
      error.http_status=response.status;
      throw error;
    }
    return response.text();
  },retryOptions);
}
const rows=parseCsv(csvText);
if(!rows.length) throw new Error("CSV contained no data rows");
const rowIndex=indexProviderRowsByCardNumber(rows);

let changed=0,unchanged=0,ambiguous=0,noMatches=0;
let exactMatches=0,quarantined=0,pricesAdded=0,pricesChanged=0;
const results=[];

for(const task of taskState.tasks||[]){
  const candidates=rowIndex.get(normalizeText(task.card_number))||[];
  const exact=[];
  for(const row of candidates){
    const identity=exactProviderIdentity(task,row);
    if(identity.exact) exact.push({row,identity});
  }

  let observation;
  if(exact.length!==1){
    observation={
      source:"sportscardspro-csv",
      status:exact.length?"ambiguous-exact-match":"no-exact-match",
      provider_product_id:null,
      exact_identity:false,
      raw_price_usd:null,
      sales_volume_yearly:null,
      query:null,
      provider_product_name:null,
      provider_set_name:null,
      identity_reasons:exact.length
        ?["multiple-exact-provider-products"]
        :["no-exact-provider-row"]
    };
  }else{
    const row=exact[0].row;
    const price=csvPriceUsd(row);
    observation={
      source:"sportscardspro-csv",
      status:price!==null?"exact-current-price":"exact-match-no-current-price",
      provider_product_id:String(row.id||""),
      exact_identity:true,
      raw_price_usd:price,
      sales_volume_yearly:
        Number.isFinite(Number(row["sales-volume"]))
          ? Number(row["sales-volume"])
          : null,
      query:null,
      provider_product_name:String(row["product-name"]||""),
      provider_set_name:String(row["console-name"]||""),
      identity_reasons:[]
    };
  }

  const previous=store.entries?.[task.task_id]||null;
  const gate=qualityGate(previous,observation,config);
  if(!gate.accepted){
    quarantined++;
    recordQuarantine(ops,task,observation,gate.reasons,nowIso,config);
    recordException(
      ops,task,"data-quality",
      {reasons:gate.reasons,provider_product_id:observation.provider_product_id||null},
      nowIso,config
    );
    results.push({
      task_id:task.task_id,
      status:"quality-quarantined",
      changed:false,
      price_usd:observation.raw_price_usd
    });
    continue;
  }

  const merged=mergeObservation(store,task,observation,nowIso);
  const priceEvent=recordPriceHistory(
    ops,task,previous,observation,nowIso,config
  );
  if(priceEvent==="first-seen") pricesAdded++;
  if(priceEvent==="price-change") pricesChanged++;
  if(merged.changed) changed++; else unchanged++;

  if(observation.status==="exact-current-price"){
    exactMatches++;
    resolveException(ops,task.task_id,nowIso);
  }else if(observation.status==="no-exact-match"){
    noMatches++;
    recordException(
      ops,task,"no-exact-match",
      {source:"bulk-index",candidate_count:candidates.length},
      nowIso,config
    );
  }else if(observation.status==="ambiguous-exact-match"){
    ambiguous++;
    recordException(
      ops,task,"ambiguous-exact-match",
      {source:"bulk-index",match_count:exact.length},
      nowIso,config
    );
  }

  results.push({
    task_id:task.task_id,
    status:observation.status,
    changed:merged.changed,
    price_usd:observation.raw_price_usd
  });
}

if(changed>0){
  store.generated_at=nowIso;
  fs.writeFileSync(path.join(root,config.observation_file),stable(store));
}

const run={
  run_key:process.env.GITHUB_RUN_ID
    ?"github:"+process.env.GITHUB_RUN_ID+":"+String(process.env.GITHUB_RUN_ATTEMPT||"1")
    :"local-bulk:"+nowIso,
  lane:"bulk",
  provider:config.bulk_lane?.provider||"sportscardspro-csv",
  started_at:nowIso,
  finished_at:nowIso,
  status:"live-success",
  credential_present:true,
  source_row_count:rows.length,
  indexed_card_number_count:rowIndex.size,
  tasks_checked:taskState.tasks?.length||0,
  exact_matches:exactMatches,
  no_exact_matches:noMatches,
  ambiguous_matches:ambiguous,
  provider_errors:0,
  changed_observations:changed,
  unchanged_observations:unchanged,
  prices_added:pricesAdded,
  prices_changed:pricesChanged,
  quarantined,
  retry_count:retryCount,
  fairness:runFairnessSummary(taskState.tasks||[]),
  results
};
recordCollectorRun(ops,run,taskState.tasks||[],config);
recomputeCoverage(ops,taskState,store,nowIso);
recomputeHealth(ops,config,nowIso);
evaluateSoakAndAcceptance(ops,config,nowIso,canonicalEvCount);
const opsFilesChanged=persistCollectorOps(root,config,ops);

console.log(JSON.stringify({
  result:"live-success",
  product_id:config.product_id,
  operational_health:ops.state.health,
  acceptance_status:ops.acceptance.status,
  row_count:rows.length,
  indexed_card_number_count:rowIndex.size,
  eligible_slot_count:taskState.eligible_slot_count,
  canonical_valued_slot_count:taskState.valued_slot_count,
  unvalued_slot_count:taskState.unvalued_slot_count,
  exact_provider_price_count:exactMatches,
  updated_observation_count:changed,
  unchanged_observation_count:unchanged,
  no_exact_match_count:noMatches,
  ambiguous_match_count:ambiguous,
  quarantined_count:quarantined,
  prices_added:pricesAdded,
  prices_changed:pricesChanged,
  retry_count:retryCount,
  coverage:ops.coverage,
  operational_files_changed:opsFilesChanged,
  result_sample:results.slice(0,50)
},null,2));
