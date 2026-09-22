import fs from "node:fs";
import path from "node:path";

const stable=value=>JSON.stringify(value,null,2)+"\n";
const round=(value,digits=4)=>{
  const factor=10**digits;
  return Math.round(Number(value)*factor)/factor;
};
const isoMs=value=>{
  const ms=Date.parse(value||"");
  return Number.isFinite(ms)?ms:null;
};

function ensureParent(file){
  fs.mkdirSync(path.dirname(file),{recursive:true});
}

export function readOps(root,file,fallback){
  const full=path.join(root,file);
  if(!fs.existsSync(full)) return structuredClone(fallback);
  return JSON.parse(fs.readFileSync(full,"utf8"));
}

export function writeOpsIfChanged(root,file,value){
  const full=path.join(root,file);
  ensureParent(full);
  const next=stable(value);
  const previous=fs.existsSync(full)?fs.readFileSync(full,"utf8"):null;
  if(previous===next) return false;
  fs.writeFileSync(full,next);
  return true;
}

export function loadCollectorOps(root,config){
  const t=config.telemetry||{};
  return {
    state:readOps(root,t.state_file,{schema_version:1,model:"collector-state-v1",lane_status:{},health:{}}),
    runs:readOps(root,t.runs_file,{schema_version:1,model:"collector-runs-v1",entries:[]}),
    metrics:readOps(root,t.metrics_file,{schema_version:1,model:"collector-metrics-v1",totals:{},by_lane:{},by_team:{},by_subject:{}}),
    coverage:readOps(root,t.coverage_file,{schema_version:1,model:"collector-coverage-v1"}),
    exceptions:readOps(root,t.exceptions_file,{schema_version:1,model:"collector-exceptions-v1",entries:{}}),
    priceHistory:readOps(root,t.price_history_file,{schema_version:1,model:"collector-price-history-v1",entries:{}}),
    quarantine:readOps(root,t.quarantine_file,{schema_version:1,model:"collector-quarantine-v1",entries:{}}),
    soak:readOps(root,t.soak_file,{schema_version:1,model:"collector-soak-v1",status:"waiting-for-live-provider"}),
    acceptance:readOps(root,t.acceptance_file,{schema_version:1,model:"continuous-market-collection-v1-acceptance",status:"pending-live-provider"})
  };
}

export function persistCollectorOps(root,config,ops){
  const t=config.telemetry||{};
  const files=[
    [t.state_file,ops.state],
    [t.runs_file,ops.runs],
    [t.metrics_file,ops.metrics],
    [t.coverage_file,ops.coverage],
    [t.exceptions_file,ops.exceptions],
    [t.price_history_file,ops.priceHistory],
    [t.quarantine_file,ops.quarantine],
    [t.soak_file,ops.soak],
    [t.acceptance_file,ops.acceptance]
  ].filter(([file])=>typeof file==="string"&&file);
  let changed=0;
  for(const [file,value] of files){
    if(writeOpsIfChanged(root,file,value)) changed++;
  }
  return changed;
}

export function providerCredentialTransition(ops,{
  lane,
  credentialPresent,
  now,
  missingReason
}){
  ops.state.lane_status=ops.state.lane_status||{};
  const previous=ops.state.lane_status[lane]||{};
  const nextStatus=credentialPresent?"configured":"blocked-config";
  const changed=
    previous.status!==nextStatus ||
    Boolean(previous.credential_present)!==Boolean(credentialPresent);

  if(changed){
    ops.state.lane_status[lane]={
      ...previous,
      status:nextStatus,
      credential_present:Boolean(credentialPresent),
      last_attempt_at:now,
      blocker:credentialPresent?null:missingReason
    };
    ops.state.updated_at=now;
  }
  return changed;
}

export function qualityGate(previous,observation,config={}){
  if(observation?.status!=="exact-current-price"){
    return {accepted:true,reasons:[]};
  }
  const price=Number(observation.raw_price_usd);
  const q=config.quality||{};
  const reasons=[];
  const min=Number(q.min_price_usd??0.01);
  const max=Number(q.max_price_usd??1_000_000);

  if(!Number.isFinite(price)||price<min||price>max){
    reasons.push("price-out-of-range");
  }
  if(!observation.provider_product_id){
    reasons.push("provider-product-id-missing");
  }
  if(!observation.provider_product_name||!observation.provider_set_name){
    reasons.push("provider-identity-fields-missing");
  }
  const previousPrice=Number(previous?.raw_price_usd);
  if(
    q.quarantine_extreme_price_changes===true &&
    Number.isFinite(previousPrice) &&
    previousPrice>0 &&
    Number.isFinite(price) &&
    price>0
  ){
    const ratio=Math.max(price/previousPrice,previousPrice/price);
    if(ratio>Number(q.max_price_change_ratio||10)){
      reasons.push("extreme-price-change");
    }
  }
  const volume=observation.sales_volume_yearly;
  if(volume!==null&&volume!==undefined&&Number(volume)<0){
    reasons.push("negative-sales-volume");
  }
  return {accepted:reasons.length===0,reasons};
}

export function recordQuarantine(ops,task,observation,reasons,at,config={}){
  const key=task.task_id;
  const previous=ops.quarantine.entries?.[key]||null;
  const entry={
    task_id:key,
    team:task.team,
    subjects:[...(task.subjects||[])],
    category:task.category,
    set:task.set,
    card_number:String(task.card_number),
    parallel:task.parallel,
    status:"open",
    reasons:[...new Set(reasons)].sort(),
    proposed_price_usd:observation.raw_price_usd??null,
    provider_product_id:observation.provider_product_id||null,
    first_seen_at:previous?.first_seen_at||at,
    last_seen_at:at,
    count:Number(previous?.count||0)+1
  };
  ops.quarantine.entries=ops.quarantine.entries||{};
  ops.quarantine.entries[key]=entry;
  ops.quarantine.updated_at=at;
  return entry;
}

export function recordPriceHistory(ops,task,previous,next,at,config={}){
  if(next?.status!=="exact-current-price"||!(Number(next.raw_price_usd)>0)) return null;
  const key=task.task_id;
  const previousPrice=Number(previous?.raw_price_usd);
  const nextPrice=Number(next.raw_price_usd);
  const store=ops.priceHistory;
  store.entries=store.entries||{};
  const entry=store.entries[key]||{
    task_id:key,
    team:task.team,
    subjects:[...(task.subjects||[])],
    card_number:String(task.card_number),
    parallel:task.parallel,
    first_seen_at:at,
    current_price_usd:null,
    changes:[]
  };
  let type=null;
  if(!(previousPrice>0)){
    type="first-seen";
  }else if(previousPrice!==nextPrice){
    type="price-change";
  }
  if(type){
    entry.changes.push({
      observed_at:at,
      type,
      from_usd:previousPrice>0?previousPrice:null,
      to_usd:nextPrice,
      source:next.source,
      provider_product_id:next.provider_product_id||null
    });
    const limit=Number(config.telemetry?.price_history_limit_per_task||50);
    entry.changes=entry.changes.slice(-limit);
  }
  entry.current_price_usd=nextPrice;
  entry.last_seen_at=at;
  store.entries[key]=entry;
  if(type) store.updated_at=at;
  return type;
}

export function recordException(ops,task,type,details,at,config={}){
  const entries=ops.exceptions.entries||(ops.exceptions.entries={});
  const key=task.task_id;
  const previous=entries[key]||null;
  const missThreshold=Number(config.telemetry?.missing_match_exception_streak||3);
  const sameType=previous?.type===type;
  let count=sameType?Number(previous?.count||0)+1:1;
  if(type==="no-exact-match"&&count>missThreshold) count=missThreshold;

  if(type==="no-exact-match"&&count<missThreshold){
    entries[key]={
      task_id:key,
      team:task.team,
      subjects:[...(task.subjects||[])],
      type,
      status:"tracking",
      count,
      first_seen_at:previous?.first_seen_at||at,
      last_seen_at:at,
      details
    };
  }else{
    entries[key]={
      task_id:key,
      team:task.team,
      subjects:[...(task.subjects||[])],
      type,
      status:"open",
      count,
      first_seen_at:previous?.first_seen_at||at,
      last_seen_at:at,
      details
    };
  }
  ops.exceptions.updated_at=at;
  return entries[key];
}

export function resolveException(ops,taskId,at){
  const entry=ops.exceptions.entries?.[taskId];
  if(!entry||entry.status==="resolved") return false;
  entry.status="resolved";
  entry.resolved_at=at;
  entry.last_seen_at=at;
  ops.exceptions.updated_at=at;
  return true;
}

function increment(obj,key,amount=1){
  obj[key]=Number(obj[key]||0)+amount;
}

export function recordCollectorRun(ops,run,selectedTasks,config={}){
  const limit=Number(config.telemetry?.run_history_limit||192);
  ops.runs.entries=Array.isArray(ops.runs.entries)?ops.runs.entries:[];
  const storedRun={
    ...run,
    result_count:Array.isArray(run.results)?run.results.length:0,
    results:Array.isArray(run.results)?run.results.slice(0,100):[]
  };
  ops.runs.entries.push(storedRun);
  ops.runs.entries=ops.runs.entries.slice(-limit);

  const totals=ops.metrics.totals||(ops.metrics.totals={});
  increment(totals,"runs");
  if(run.status.startsWith("live-")) increment(totals,"live_runs");
  if(run.status==="blocked-config") increment(totals,"blocked_config_runs");
  increment(totals,"tasks_checked",run.tasks_checked||0);
  increment(totals,"exact_matches",run.exact_matches||0);
  increment(totals,"no_exact_matches",run.no_exact_matches||0);
  increment(totals,"ambiguous_matches",run.ambiguous_matches||0);
  increment(totals,"provider_errors",run.provider_errors||0);
  increment(totals,"prices_added",run.prices_added||0);
  increment(totals,"prices_changed",run.prices_changed||0);
  increment(totals,"quarantined",run.quarantined||0);

  const byLane=ops.metrics.by_lane||(ops.metrics.by_lane={});
  const lane=byLane[run.lane]||(byLane[run.lane]={});
  increment(lane,"runs");
  if(run.status.startsWith("live-")) increment(lane,"live_runs");
  increment(lane,"tasks_checked",run.tasks_checked||0);
  increment(lane,"provider_errors",run.provider_errors||0);
  lane.last_run_at=run.finished_at;

  const resultByTask=new Map((run.results||[]).map(x=>[x.task_id,x]));
  for(const task of selectedTasks||[]){
    const result=resultByTask.get(task.task_id);
    if(!result) continue;
    const teamMap=ops.metrics.by_team||(ops.metrics.by_team={});
    const team=teamMap[task.team]||(teamMap[task.team]={checked:0,exact_matches:0,provider_errors:0});
    team.checked++;
    if(result.status==="exact-current-price") team.exact_matches++;
    if(result.status==="provider-error") team.provider_errors++;

    const subjectName=String(task.subjects?.[0]||"Unknown");
    const subjectMap=ops.metrics.by_subject||(ops.metrics.by_subject={});
    const subject=subjectMap[subjectName]||(subjectMap[subjectName]={checked:0,exact_matches:0});
    subject.checked++;
    if(result.status==="exact-current-price") subject.exact_matches++;
  }

  ops.metrics.updated_at=run.finished_at;
  ops.state.latest_run={
    run_key:run.run_key,
    lane:run.lane,
    status:run.status,
    finished_at:run.finished_at,
    tasks_checked:run.tasks_checked,
    exact_matches:run.exact_matches,
    provider_errors:run.provider_errors
  };
  ops.state.updated_at=run.finished_at;

  const laneState=ops.state.lane_status?.[run.lane]||(ops.state.lane_status[run.lane]={});
  laneState.last_attempt_at=run.finished_at;
  laneState.credential_present=run.credential_present===true;
  laneState.status=run.status;
  if(run.status.startsWith("live-")){
    laneState.last_live_success_at=run.finished_at;
    laneState.blocker=null;
    ops.state.last_live_observation_at=run.finished_at;
  }
  if((run.changed_observations||0)>0||(run.prices_changed||0)>0){
    laneState.last_data_change_at=run.finished_at;
    ops.state.last_data_change_at=run.finished_at;
  }
}

export function recomputeCoverage(ops,taskState,observations,at){
  const taskMap=new Map((taskState.tasks||[]).map(task=>[task.task_id,task]));
  const checked=new Set();
  const byTeam={};
  const byCategory={};
  const counters={
    exact_provider_price_count:0,
    exact_match_no_price_count:0,
    no_exact_match_count:0,
    ambiguous_match_count:0,
    provider_error_only_count:0,
    quarantined_count:0
  };

  const bump=(container,key,field)=>{
    const row=container[key]||(container[key]={eligible:0,checked:0,exact_provider_price:0});
    row[field]=(row[field]||0)+1;
  };
  for(const task of taskState.tasks||[]){
    bump(byTeam,task.team,"eligible");
    bump(byCategory,task.category,"eligible");
  }

  for(const [taskId,observation] of Object.entries(observations.entries||{})){
    const task=taskMap.get(taskId);
    if(!task) continue;
    checked.add(taskId);
    bump(byTeam,task.team,"checked");
    bump(byCategory,task.category,"checked");
    if(observation.status==="exact-current-price"){
      counters.exact_provider_price_count++;
      bump(byTeam,task.team,"exact_provider_price");
      bump(byCategory,task.category,"exact_provider_price");
    }else if(observation.status==="exact-match-no-current-price"){
      counters.exact_match_no_price_count++;
    }else if(observation.status==="no-exact-match"){
      counters.no_exact_match_count++;
    }else if(observation.status==="ambiguous-exact-match"){
      counters.ambiguous_match_count++;
    }
  }

  for(const [taskId,entry] of Object.entries(ops.exceptions.entries||{})){
    const task=taskMap.get(taskId);
    if(!task||entry.status==="resolved") continue;
    checked.add(taskId);
    if(entry.type==="provider-error"&&!observations.entries?.[taskId]){
      counters.provider_error_only_count++;
    }
  }
  for(const taskId of Object.keys(ops.quarantine.entries||{})){
    if(taskMap.has(taskId)){
      checked.add(taskId);
      counters.quarantined_count++;
    }
  }

  const unvalued=Number(taskState.unvalued_slot_count||taskState.tasks?.length||0);
  ops.coverage={
    ...ops.coverage,
    schema_version:1,
    model:"collector-coverage-v1",
    product_id:observations.product_id,
    updated_at:at,
    eligible_slot_count:Number(taskState.eligible_slot_count||0),
    canonical_valued_slot_count:Number(taskState.valued_slot_count||0),
    unvalued_slot_count:unvalued,
    unique_tasks_checked:checked.size,
    never_checked:Math.max(0,unvalued-checked.size),
    ...counters,
    checked_percent:unvalued?round(checked.size/unvalued*100):100,
    exact_provider_price_percent:unvalued?round(counters.exact_provider_price_count/unvalued*100):0,
    by_team:byTeam,
    by_category:byCategory
  };
}

export function recomputeHealth(ops,config,at){
  const now=isoMs(at)||Date.now();
  const fast=ops.state.lane_status?.fast||{};
  const bulk=ops.state.lane_status?.bulk||{};
  const staleFast=Number(config.telemetry?.stale_fast_lane_minutes||45)*60_000;
  const staleBulk=Number(config.telemetry?.stale_bulk_lane_hours||36)*3_600_000;
  let status="healthy",reason="live-collection-current";

  if(fast.credential_present!==true){
    status="stalled"; reason="fast-lane-not-configured";
  }else if(
    ops.state.licensing?.public_sharing_required===true &&
    ops.state.licensing?.public_sharing_approved!==true
  ){
    status="stalled"; reason="commercial-sharing-not-approved";
  }else if(!isoMs(fast.last_live_success_at)||now-isoMs(fast.last_live_success_at)>staleFast){
    status="stalled"; reason="fast-lane-stale";
  }else{
    const latest=ops.state.latest_run;
    if(
      latest?.lane==="fast" &&
      Number(latest.tasks_checked)>0 &&
      Number(latest.provider_errors)/Number(latest.tasks_checked)>
        Number(config.telemetry?.degraded_provider_error_rate||0.25)
    ){
      status="degraded"; reason="provider-error-rate-high";
    }else if(
      bulk.credential_present===true &&
      isoMs(bulk.last_live_success_at) &&
      now-isoMs(bulk.last_live_success_at)>staleBulk
    ){
      status="degraded"; reason="bulk-lane-stale";
    }
  }
  ops.state.health={status,reason,evaluated_at:at};
  return ops.state.health;
}

export function evaluateSoakAndAcceptance(ops,config,at,canonicalEvCount){
  const policy=config.acceptance||{};
  const metrics=ops.metrics;
  const coverage=ops.coverage;
  const fast=ops.state.lane_status?.fast||{};
  let soak=ops.soak||{};

  if(fast.credential_present!==true||!fast.last_live_success_at){
    ops.soak={
      ...soak,
      status:"waiting-for-live-provider",
      last_evaluated_at:at,
      blockers:["Fast lane has not completed a live provider run."]
    };
  }else{
    if(!soak.started_at){
      soak={
        schema_version:1,
        model:"collector-soak-v1",
        product_id:config.product_id,
        status:"running",
        started_at:fast.last_live_success_at,
        last_evaluated_at:at,
        baseline:{
          fast_live_runs:Number(metrics.by_lane?.fast?.live_runs||0)-1,
          tasks_checked:Number(metrics.totals?.tasks_checked||0)-Number(ops.state.latest_run?.tasks_checked||0),
          exact_matches:Number(metrics.totals?.exact_matches||0)-Number(ops.state.latest_run?.exact_matches||0),
          provider_errors:Number(metrics.totals?.provider_errors||0)-Number(ops.state.latest_run?.provider_errors||0),
          unique_tasks_checked:Math.max(0,Number(coverage.unique_tasks_checked||0)-Number(ops.state.latest_run?.tasks_checked||0)),
          canonical_ev_contribution_count:Number(canonicalEvCount||0)
        }
      };
    }
    const start=isoMs(soak.started_at);
    const elapsed=start?Math.max(0,(isoMs(at)-start)/3_600_000):0;
    const liveRuns=Math.max(0,Number(metrics.by_lane?.fast?.live_runs||0)-Number(soak.baseline?.fast_live_runs||0));
    const exact=Math.max(0,Number(metrics.totals?.exact_matches||0)-Number(soak.baseline?.exact_matches||0));
    const errors=Math.max(0,Number(metrics.totals?.provider_errors||0)-Number(soak.baseline?.provider_errors||0));
    const checked=Math.max(0,Number(metrics.totals?.tasks_checked||0)-Number(soak.baseline?.tasks_checked||0));
    const distinct=Math.max(0,Number(coverage.unique_tasks_checked||0)-Number(soak.baseline?.unique_tasks_checked||0));
    const errorRate=checked?errors/checked:0;
    const blockers=[];
    if(elapsed<Number(policy.soak_hours||24)) blockers.push("24-hour soak window not complete.");
    if(liveRuns<Number(policy.min_successful_live_fast_runs||72)) blockers.push("Insufficient successful live fast-lane runs.");
    if(distinct<Number(policy.min_distinct_tasks_checked||500)) blockers.push("Insufficient distinct tasks checked.");
    if(exact<Number(policy.min_exact_provider_matches||1)) blockers.push("No exact provider price has been observed during the soak.");
    if(errorRate>Number(policy.max_provider_error_rate||0.15)) blockers.push("Provider error rate exceeds acceptance threshold.");
    if(Number(canonicalEvCount)!==Number(soak.baseline?.canonical_ev_contribution_count)){
      blockers.push("Canonical EV contribution count changed during soak.");
    }
    soak={
      ...soak,
      status:blockers.length===0?"passed":elapsed>=Number(policy.soak_hours||24)?"failed-criteria":"running",
      last_evaluated_at:at,
      elapsed_hours:round(elapsed,3),
      successful_live_fast_runs:liveRuns,
      tasks_checked:checked,
      distinct_tasks_checked:distinct,
      exact_provider_matches:exact,
      provider_errors:errors,
      provider_error_rate:round(errorRate,4),
      canonical_ev_current:{contribution_count:Number(canonicalEvCount||0)},
      blockers
    };
    ops.soak=soak;
  }

  const checks={
    live_fast_lane:fast.credential_present===true&&Boolean(fast.last_live_success_at),
    soak_24h:Number(ops.soak.elapsed_hours||0)>=Number(policy.soak_hours||24),
    min_live_runs:Number(ops.soak.successful_live_fast_runs||0)>=Number(policy.min_successful_live_fast_runs||72),
    min_distinct_tasks:Number(ops.soak.distinct_tasks_checked||0)>=Number(policy.min_distinct_tasks_checked||500),
    exact_provider_data:Number(ops.soak.exact_provider_matches||0)>=Number(policy.min_exact_provider_matches||1),
    error_rate:Number(ops.soak.provider_error_rate??1)<=Number(policy.max_provider_error_rate||0.15),
    canonical_ev_unchanged:
      !ops.soak.baseline ||
      Number(canonicalEvCount)===Number(ops.soak.baseline.canonical_ev_contribution_count),
    commercial_sharing_approved:
      policy.require_public_sharing_approval!==true ||
      ops.state.licensing?.public_sharing_approved===true
  };
  const required=Object.values(checks);
  const passed=required.every(Boolean);
  ops.acceptance={
    schema_version:1,
    model:"continuous-market-collection-v1-acceptance",
    product_id:config.product_id,
    status:passed?"passed":checks.live_fast_lane?"running":"pending-live-provider",
    evaluated_at:at,
    contract_id:passed?"continuous-market-collection-v1":null,
    criteria:policy,
    checks,
    blockers:passed?[]:Object.entries(checks).filter(([,value])=>!value).map(([key])=>key)
  };
  return ops.acceptance;
}

export async function withRetry(operation,{
  maxAttempts=3,
  baseDelayMs=750,
  maxDelayMs=8000,
  shouldRetry=()=>true,
  onRetry=()=>{}
}={}){
  let lastError=null;
  for(let attempt=1;attempt<=Math.max(1,Number(maxAttempts)||1);attempt++){
    try{
      return await operation(attempt);
    }catch(error){
      lastError=error;
      if(attempt>=maxAttempts||!shouldRetry(error)) throw error;
      const delay=Math.min(
        Number(maxDelayMs)||8000,
        (Number(baseDelayMs)||750)*(2**(attempt-1))
      );
      onRetry({attempt,error,delay_ms:delay});
      await new Promise(resolve=>setTimeout(resolve,delay));
    }
  }
  throw lastError;
}

export function runFairnessSummary(selectedTasks=[]){
  const teamCounts={},subjectCounts={};
  for(const task of selectedTasks){
    increment(teamCounts,task.team);
    increment(subjectCounts,String(task.subjects?.[0]||"Unknown"));
  }
  const values=Object.values(teamCounts);
  return {
    distinct_teams:Object.keys(teamCounts).length,
    distinct_subjects:Object.keys(subjectCounts).length,
    max_tasks_per_team:values.length?Math.max(...values):0,
    min_tasks_per_selected_team:values.length?Math.min(...values):0,
    team_counts:teamCounts,
    subject_counts:subjectCounts
  };
}
