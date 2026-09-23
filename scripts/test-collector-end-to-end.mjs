import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {buildUnvaluedCollectionTasks} from "./lib/ev-slot-inventory.mjs";
import {
  buildSearchQuery,
  selectCursorBatch
} from "./lib/market-automation.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),"utf8"));
const config=read("data/collection/continuous-market-collector-config-v1.json");
const sources=config.task_sources;
const taskState=buildUnvaluedCollectionTasks({
  product:config.product_id,
  inventory:read(sources.inventory),
  provenance:read(sources.provenance),
  baseOdds:read(sources.base_odds),
  insertMap:read(sources.insert_odds_mapping),
  autoMap:read(sources.autograph_odds_mapping),
  inserts:read(sources.insert_checklist),
  mainAutos:read(sources.main_autographs),
  specialAutos:read(sources.special_autographs),
  format:read(sources.format)
});
const selected=selectCursorBatch(taskState.tasks,{
  cursor:0,batchSize:1,maxTasksPerSubject:2,maxTasksPerTeam:2
});
assert.equal(selected.batch.length,1);
const task=selected.batch[0];
const query=buildSearchQuery(task);

const tempRoot=fs.mkdtempSync(path.join(root,".collector-e2e-"));
const rel=file=>path.relative(root,path.join(tempRoot,file)).replaceAll("\\","/");
const testConfig=structuredClone(config);
testConfig.observation_file=rel("observations.json");
testConfig.telemetry={
  ...testConfig.telemetry,
  state_file:rel("state.json"),
  runs_file:rel("runs.json"),
  metrics_file:rel("metrics.json"),
  coverage_file:rel("coverage.json"),
  exceptions_file:rel("exceptions.json"),
  price_history_file:rel("price-history.json"),
  quarantine_file:rel("quarantine.json"),
  soak_file:rel("soak.json"),
  acceptance_file:rel("acceptance.json")
};
const configFile=rel("config.json");
const fixtureFile=rel("fixture.json");

fs.writeFileSync(path.join(root,testConfig.observation_file),JSON.stringify({
  schema_version:1,
  model:"market-observations-v1",
  product_id:config.product_id,
  currency:"USD",
  generated_at:null,
  sources:{},
  entries:{}
},null,2)+"\n");

const parallel=task.parallel==="Base"?"Base":task.parallel;
const subjectText=(task.subjects||[]).join(" / ");
const setText=task.set==="Base Cards"?"":(" "+task.set);
const product={
  id:"fixture-1",
  "console-name":"Soccer Cards 2026 Topps Chrome Premier League",
  "product-name":subjectText+" ["+parallel+"] #"+task.card_number+setText,
  "loose-price":299,
  "sales-volume":"1"
};
const fixture={
  search_by_query:{
    [query]:{status:"success",products:[product]}
  },
  product_by_id:{
    "fixture-1":{status:"success",...product}
  }
};
fs.writeFileSync(path.join(root,configFile),JSON.stringify(testConfig,null,2)+"\n");
fs.writeFileSync(path.join(root,fixtureFile),JSON.stringify(fixture,null,2)+"\n");

try{
  const run=spawnSync(process.execPath,[
    "scripts/collect-market-data.mjs",
    "--config",configFile,
    "--fixture",fixtureFile,
    "--batch-size","1",
    "--now","2026-09-22T12:00:00.000Z"
  ],{cwd:root,encoding:"utf8"});
  if(run.status!==0){
    throw new Error("collector failed\n"+run.stdout+"\n"+run.stderr);
  }
  const output=JSON.parse(run.stdout);
  assert.equal(output.result,"live-success");
  assert.equal(output.selected_task_count,1);
  assert.equal(output.exact_provider_price_count,1);

  const observations=read(testConfig.observation_file);
  assert.equal(Object.keys(observations.entries).length,1);
  assert.equal(observations.entries[task.task_id].status,"exact-current-price");
  assert.equal(observations.entries[task.task_id].raw_price_usd,2.99);

  const state=read(testConfig.telemetry.state_file);
  const coverage=read(testConfig.telemetry.coverage_file);
  const history=read(testConfig.telemetry.price_history_file);
  const soak=read(testConfig.telemetry.soak_file);
  assert.notEqual(state.fast_lane_cursor,0);
  assert.equal(coverage.unique_tasks_checked,1);
  assert.equal(coverage.exact_provider_price_count,1);
  assert.equal(history.entries[task.task_id].current_price_usd,2.99);
  assert.equal(soak.status,"running");

  console.log(JSON.stringify({
    result:"pass",
    task_id:task.task_id,
    cursor_next:state.fast_lane_cursor,
    coverage_checked:coverage.unique_tasks_checked,
    exact_provider_prices:coverage.exact_provider_price_count,
    soak_status:soak.status
  },null,2));
}finally{
  fs.rmSync(tempRoot,{recursive:true,force:true});
}
