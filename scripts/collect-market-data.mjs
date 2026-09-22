import fs from "node:fs";
import path from "node:path";
import {
  apiPriceUsd,
  buildSearchQuery,
  exactProviderIdentity,
  mergeObservation,
  selectCursorBatch
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
const token=process.env[config.fast_lane?.credential_env||"SPORTSCARDSPRO_TOKEN"]||"";
const fixture=fixturePath ? readJson(fixturePath) : null;
const approvalEnv=
  config.licensing?.approval_env||"SPORTSCARDSPRO_COMMERCIAL_SHARING_APPROVED";
const approvalRaw=String(process.env[approvalEnv]||"").trim().toLowerCase();
const sharingApproved=
  Boolean(fixture) ||
  ["1","true","yes","approved"].includes(approvalRaw);
ops.state.licensing={
  public_repository:config.licensing?.repository_visibility==="public",
  public_sharing_required:config.licensing?.public_sharing_requires_approval===true,
  public_sharing_approved:sharingApproved,
  status:sharingApproved?"approved":"blocked-pending-approval"
};
const batchSize=Number(valueAfter("--batch-size")||config.fast_lane?.batch_size||20);
const minDelay=Number(config.fast_lane?.min_request_interval_ms||1100);
const retry=config.retry||{};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

const credentialTransition=providerCredentialTransition(ops,{
  lane:"fast",
  credentialPresent:Boolean(fixture||token),
  now:nowIso,
  missingReason:"SPORTSCARDSPRO_TOKEN is missing."
});

if(!fixture&&token&&!sharingApproved){
  ops.state.lane_status=ops.state.lane_status||{};
  ops.state.lane_status.fast={
    ...(ops.state.lane_status.fast||{}),
    status:"blocked-license",
    credential_present:true,
    last_attempt_at:nowIso,
    blocker:"Commercial sharing approval is required before provider data can be persisted in this public repository."
  };
  recomputeCoverage(ops,taskState,store,nowIso);
  recomputeHealth(ops,config,nowIso);
  evaluateSoakAndAcceptance(ops,config,nowIso,canonicalEvCount);
  persistCollectorOps(root,config,ops);
  console.log(JSON.stringify({
    result:"disabled-missing-commercial-sharing-approval",
    operational_health:ops.state.health,
    approval_env:approvalEnv,
    message:"Provider token is present, but public persistence remains blocked until commercial sharing approval is explicitly configured."
  },null,2));
  process.exit(0);
}

if(!fixture&&!token){
  if(credentialTransition){
    recomputeCoverage(ops,taskState,store,nowIso);
    recomputeHealth(ops,config,nowIso);
    evaluateSoakAndAcceptance(ops,config,nowIso,canonicalEvCount);
    persistCollectorOps(root,config,ops);
  }
  console.log(JSON.stringify({
    result:"disabled-missing-credential",
    operational_health:ops.state.health,
    credential_env:config.fast_lane?.credential_env||"SPORTSCARDSPRO_TOKEN",
    message:"Fast lane is installed and scheduled but cannot collect live provider data until the repository secret is configured."
  },null,2));
  process.exit(0);
}

let lastRequestAt=0;
let retryCount=0;
async function throttledJson(url){
  const elapsed=Date.now()-lastRequestAt;
  if(elapsed<minDelay) await sleep(minDelay-elapsed);
  let response;
  try{
    response=await fetch(url,{
      headers:{
        accept:"application/json",
        "user-agent":"BreakMetric-market-collector/2.0"
      }
    });
  }finally{
    lastRequestAt=Date.now();
  }
  if(!response.ok){
    const error=new Error("Provider HTTP "+response.status);
    error.http_status=response.status;
    throw error;
  }
  const json=await response.json();
  if(json?.status==="error"){
    const error=new Error(
      "Provider error: "+String(json["error-message"]||"unknown")
    );
    error.provider_error=true;
    throw error;
  }
  return json;
}

const retryStatuses=new Set((retry.retry_http_statuses||[]).map(Number));
const shouldRetry=error=>{
  const status=Number(error?.http_status);
  if(Number.isFinite(status)) return retryStatuses.has(status);
  return true;
};
const retryOptions={
  maxAttempts:Number(retry.max_attempts||3),
  baseDelayMs:Number(retry.base_delay_ms||750),
  maxDelayMs:Number(retry.max_delay_ms||8000),
  shouldRetry,
  onRetry:()=>{retryCount++;}
};

async function providerSearch(query){
  if(fixture){
    return fixture.search_by_query?.[query]||{status:"success",products:[]};
  }
  const url="https://www.sportscardspro.com/api/products?t="+
    encodeURIComponent(token)+"&q="+encodeURIComponent(query);
  return withRetry(()=>throttledJson(url),retryOptions);
}

async function providerProduct(id){
  if(fixture){
    const result=fixture.product_by_id?.[String(id)];
    if(!result){
      const error=new Error("fixture missing product detail");
      error.provider_error=true;
      throw error;
    }
    return result;
  }
  const url="https://www.sportscardspro.com/api/product?t="+
    encodeURIComponent(token)+"&id="+encodeURIComponent(id);
  return withRetry(()=>throttledJson(url),retryOptions);
}

const tasks=(taskState.tasks||[]).filter(task=>task.status==="unvalued");
const selection=selectCursorBatch(tasks,{
  cursor:Number(ops.state.fast_lane_cursor||0),
  batchSize,
  maxTasksPerSubject:Number(config.fast_lane?.max_tasks_per_subject_per_batch||2),
  maxTasksPerTeam:Number(config.fast_lane?.max_tasks_per_team_per_batch||2)
});
const startedAt=nowIso;
let changed=0,unchanged=0,providerErrors=0,exactMatches=0;
let noMatches=0,ambiguous=0,quarantined=0,pricesAdded=0,pricesChanged=0;
const results=[];

for(const task of selection.batch){
  const query=buildSearchQuery(task);
  try{
    const search=await providerSearch(query);
    const products=Array.isArray(search.products)?search.products:[];
    const assessed=products.map(product=>({
      product,
      identity:exactProviderIdentity(task,product)
    }));
    const exact=assessed.filter(row=>row.identity.exact);

    let observation;
    if(exact.length!==1){
      observation={
        source:"sportscardspro-api",
        status:exact.length===0?"no-exact-match":"ambiguous-exact-match",
        provider_product_id:null,
        exact_identity:false,
        raw_price_usd:null,
        sales_volume_yearly:null,
        query,
        provider_product_name:null,
        provider_set_name:null,
        identity_reasons:exact.length===0
          ? [...new Set(assessed.flatMap(row=>row.identity.reasons))].slice(0,20)
          : ["multiple-exact-provider-products"]
      };
    }else{
      const detail=await providerProduct(exact[0].product.id);
      const identity=exactProviderIdentity(task,detail);
      const price=identity.exact ? apiPriceUsd(detail) : null;
      observation={
        source:"sportscardspro-api",
        status:identity.exact && price!==null
          ? "exact-current-price"
          : identity.exact
            ? "exact-match-no-current-price"
            : "detail-identity-mismatch",
        provider_product_id:String(detail.id||exact[0].product.id||""),
        exact_identity:identity.exact,
        raw_price_usd:price,
        sales_volume_yearly:
          Number.isFinite(Number(detail["sales-volume"]))
            ? Number(detail["sales-volume"])
            : null,
        query,
        provider_product_name:String(detail["product-name"]||""),
        provider_set_name:String(detail["console-name"]||""),
        identity_reasons:identity.reasons
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
        price_usd:observation.raw_price_usd,
        reasons:gate.reasons
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
        {query,identity_reasons:observation.identity_reasons},
        nowIso,config
      );
    }else if(observation.status==="ambiguous-exact-match"){
      ambiguous++;
      recordException(
        ops,task,"ambiguous-exact-match",
        {query,match_count:exact.length},
        nowIso,config
      );
    }else if(observation.status==="detail-identity-mismatch"){
      recordException(
        ops,task,"identity-mismatch",
        {query,identity_reasons:observation.identity_reasons},
        nowIso,config
      );
    }

    results.push({
      task_id:task.task_id,
      status:observation.status,
      changed:merged.changed,
      price_usd:observation.raw_price_usd
    });
  }catch(error){
    providerErrors++;
    recordException(
      ops,task,"provider-error",
      {
        error:String(error?.message||error),
        http_status:Number.isFinite(Number(error?.http_status))
          ? Number(error.http_status)
          : null
      },
      nowIso,config
    );
    results.push({
      task_id:task.task_id,
      status:"provider-error",
      error:String(error?.message||error)
    });
  }
}

if(changed>0){
  store.generated_at=nowIso;
  fs.writeFileSync(path.join(root,config.observation_file),stable(store));
}

ops.state.fast_lane_cursor=selection.next_cursor;
const checked=selection.batch.length;
const finishedAt=nowArg?nowIso:new Date().toISOString();
const status=
  checked===0
    ?"live-empty"
    :providerErrors===checked
      ?"live-failure"
      :providerErrors>0
        ?"live-partial"
        :"live-success";
const run={
  run_key:process.env.GITHUB_RUN_ID
    ?"github:"+process.env.GITHUB_RUN_ID+":"+String(process.env.GITHUB_RUN_ATTEMPT||"1")
    :"local-fast:"+startedAt,
  lane:"fast",
  provider:config.fast_lane?.provider||"sportscardspro-api",
  started_at:startedAt,
  finished_at:finishedAt,
  status,
  credential_present:true,
  cursor_start:selection.cursor,
  cursor_next:selection.next_cursor,
  queue_size:selection.queue_size,
  queue_wrapped:selection.wrapped,
  tasks_checked:checked,
  exact_matches:exactMatches,
  no_exact_matches:noMatches,
  ambiguous_matches:ambiguous,
  provider_errors:providerErrors,
  changed_observations:changed,
  unchanged_observations:unchanged,
  prices_added:pricesAdded,
  prices_changed:pricesChanged,
  quarantined,
  retry_count:retryCount,
  fairness:runFairnessSummary(selection.batch),
  results
};
recordCollectorRun(ops,run,selection.batch,config);
recomputeCoverage(ops,taskState,store,finishedAt);
recomputeHealth(ops,config,finishedAt);
evaluateSoakAndAcceptance(ops,config,finishedAt,canonicalEvCount);
const opsFilesChanged=persistCollectorOps(root,config,ops);

console.log(JSON.stringify({
  result:status,
  product_id:config.product_id,
  operational_health:ops.state.health,
  acceptance_status:ops.acceptance.status,
  eligible_slot_count:taskState.eligible_slot_count,
  canonical_valued_slot_count:taskState.valued_slot_count,
  unvalued_slot_count:taskState.unvalued_slot_count,
  cursor_start:selection.cursor,
  cursor_next:selection.next_cursor,
  queue_size:selection.queue_size,
  selected_task_count:checked,
  exact_provider_price_count:exactMatches,
  updated_observation_count:changed,
  unchanged_observation_count:unchanged,
  no_exact_match_count:noMatches,
  ambiguous_match_count:ambiguous,
  provider_error_count:providerErrors,
  quarantined_count:quarantined,
  retry_count:retryCount,
  fairness:run.fairness,
  coverage:ops.coverage,
  operational_files_changed:opsFilesChanged,
  results
},null,2));
