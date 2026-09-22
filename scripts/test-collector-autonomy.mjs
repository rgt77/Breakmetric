import assert from "node:assert/strict";
import {
  evaluateSoakAndAcceptance,
  qualityGate,
  recordCollectorRun,
  recordPriceHistory,
  recomputeCoverage,
  recomputeHealth,
  runFairnessSummary,
  withRetry
} from "./lib/collector-telemetry.mjs";
import {
  fairCollectionOrder,
  selectCursorBatch
} from "./lib/market-automation.mjs";

const synthetic=[];
for(let t=0;t<20;t++){
  for(let s=0;s<3;s++){
    synthetic.push({
      task_id:"t"+t+"-"+s,
      team:"Team "+String(t).padStart(2,"0"),
      subjects:["Player "+t+"-"+s],
      category:"base_parallels",
      set:"Base Cards",
      card_number:String(t*10+s),
      parallel:"Refractor",
      collection_priority_score:100-s
    });
  }
}
const fair=fairCollectionOrder(synthetic);
assert.equal(new Set(fair.slice(0,20).map(x=>x.team)).size,20);

const first=selectCursorBatch(synthetic,{
  cursor:0,batchSize:20,maxTasksPerSubject:2,maxTasksPerTeam:2
});
assert.equal(first.batch.length,20);
assert.equal(new Set(first.batch.map(x=>x.team)).size,20);
const second=selectCursorBatch(synthetic,{
  cursor:first.next_cursor,batchSize:20,maxTasksPerSubject:2,maxTasksPerTeam:2
});
assert.notDeepEqual(
  second.batch.map(x=>x.task_id),
  first.batch.map(x=>x.task_id)
);
assert.equal(runFairnessSummary(first.batch).max_tasks_per_team,1);

let attempts=0;
const retryValue=await withRetry(async()=>{
  attempts++;
  if(attempts<3) throw new Error("temporary");
  return "ok";
},{
  maxAttempts:3,
  baseDelayMs:1,
  maxDelayMs:2,
  shouldRetry:()=>true
});
assert.equal(retryValue,"ok");
assert.equal(attempts,3);

const previous={raw_price_usd:2};
const proposed={
  status:"exact-current-price",
  raw_price_usd:50,
  provider_product_id:"1",
  provider_product_name:"Card #1",
  provider_set_name:"2026 Topps Chrome Premier League"
};
assert.equal(
  qualityGate(previous,proposed,{
    quality:{min_price_usd:.01,max_price_usd:1000000,max_price_change_ratio:10,quarantine_extreme_price_changes:true}
  }).accepted,
  false
);

const ops={
  state:{
    fast_lane_cursor:0,
    licensing:{
      public_sharing_required:true,
      public_sharing_approved:true
    },
    lane_status:{
      fast:{credential_present:true,last_live_success_at:"2026-09-22T00:00:00.000Z"},
      bulk:{credential_present:false}
    },
    health:{}
  },
  runs:{entries:[]},
  metrics:{
    totals:{runs:0,live_runs:0,tasks_checked:0,exact_matches:0,provider_errors:0},
    by_lane:{fast:{runs:0,live_runs:0,tasks_checked:0,provider_errors:0}},
    by_team:{},
    by_subject:{}
  },
  coverage:{
    unique_tasks_checked:0
  },
  exceptions:{entries:{}},
  priceHistory:{entries:{}},
  quarantine:{entries:{}},
  soak:{status:"waiting-for-live-provider"},
  acceptance:{status:"pending-live-provider"}
};
const task={
  task_id:"release::hobby::Team 00::base_parallels::Base Cards::1::Refractor",
  team:"Team 00",
  subjects:["Player 00"],
  category:"base_parallels",
  set:"Base Cards",
  card_number:"1",
  parallel:"Refractor"
};
const type1=recordPriceHistory(ops,task,null,{
  status:"exact-current-price",
  raw_price_usd:2,
  source:"fixture",
  provider_product_id:"1"
},"2026-09-22T00:00:00.000Z",{telemetry:{price_history_limit_per_task:50}});
assert.equal(type1,"first-seen");
const type2=recordPriceHistory(ops,task,{raw_price_usd:2},{
  status:"exact-current-price",
  raw_price_usd:3,
  source:"fixture",
  provider_product_id:"1"
},"2026-09-22T01:00:00.000Z",{telemetry:{price_history_limit_per_task:50}});
assert.equal(type2,"price-change");
assert.equal(ops.priceHistory.entries[task.task_id].changes.length,2);

const policy={
  telemetry:{stale_fast_lane_minutes:45,degraded_provider_error_rate:.25},
  acceptance:{
    soak_hours:24,
    min_successful_live_fast_runs:72,
    min_distinct_tasks_checked:500,
    min_exact_provider_matches:1,
    max_provider_error_rate:.15,
    require_public_sharing_approval:true
  }
};
recomputeHealth(ops,policy,"2026-09-22T00:20:00.000Z");
assert.equal(ops.state.health.status,"healthy");

for(let i=0;i<72;i++){
  const run={
    run_key:"test:"+i,
    lane:"fast",
    status:"live-success",
    credential_present:true,
    finished_at:new Date(Date.parse("2026-09-22T00:00:00.000Z")+i*20*60_000).toISOString(),
    tasks_checked:10,
    exact_matches:i===0?1:0,
    no_exact_matches:0,
    ambiguous_matches:0,
    provider_errors:0,
    changed_observations:i===0?1:0,
    prices_added:i===0?1:0,
    prices_changed:0,
    quarantined:0,
    results:[]
  };
  recordCollectorRun(ops,run,[],{telemetry:{run_history_limit:192}});
}
ops.coverage.unique_tasks_checked=600;
ops.state.lane_status.fast.credential_present=true;
ops.state.lane_status.fast.last_live_success_at="2026-09-23T00:10:00.000Z";
ops.soak={
  schema_version:1,
  model:"collector-soak-v1",
  product_id:"test",
  status:"running",
  started_at:"2026-09-22T00:00:00.000Z",
  baseline:{
    fast_live_runs:0,
    tasks_checked:0,
    exact_matches:0,
    provider_errors:0,
    unique_tasks_checked:0,
    canonical_ev_contribution_count:33
  }
};
evaluateSoakAndAcceptance(
  ops,
  policy,
  "2026-09-23T00:10:00.000Z",
  33
);
assert.equal(ops.soak.status,"passed");
assert.equal(ops.acceptance.status,"passed");
assert.equal(ops.acceptance.contract_id,"continuous-market-collection-v1");

evaluateSoakAndAcceptance(
  ops,
  policy,
  "2026-09-24T00:10:00.000Z",
  34
);
assert.equal(
  ops.acceptance.status,
  "passed",
  "passed collector contract must remain stable after later canonical EV growth"
);
assert.equal(
  ops.acceptance.contract_id,
  "continuous-market-collection-v1"
);

console.log(JSON.stringify({
  result:"pass",
  checks:19,
  fairness:first.batch.length,
  retry_attempts:attempts,
  soak_status:ops.soak.status,
  acceptance_status:ops.acceptance.status
},null,2));
