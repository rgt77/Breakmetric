import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root=process.cwd();
const queuePath="data/market/2026-topps-chrome-premier-league/market-verification-queue-v1.json";
const readJson=file=>JSON.parse(fs.readFileSync(path.join(root,file),"utf8"));
const queue=readJson(queuePath);
const failures=[];

const sandbox={console,Object,Array,String,Number,Boolean,Set,Map,Math,JSON};
sandbox.globalThis=sandbox;
vm.createContext(sandbox);
vm.runInContext(
  fs.readFileSync(path.join(root,"src/marketVerificationTasks.js"),"utf8"),
  sandbox,
  {filename:"src/marketVerificationTasks.js"}
);
const model=sandbox.BreakMetricMarketVerificationTasks;

const recordsBySource={};
let expectedSaleCount=0;
for(const item of queue.items||[]){
  const source=item.market_source_file;
  if(!source || !fs.existsSync(path.join(root,source))){
    failures.push("missing market source for "+(item.card_id||"unknown"));
    continue;
  }
  if(!recordsBySource[source]) recordsBySource[source]=readJson(source);
  expectedSaleCount+=(recordsBySource[source].sales||[]).length;
}

const first=model.build(queue,recordsBySource);
const second=model.build(queue,recordsBySource);
const validation=model.validate(first);

if(!validation.valid) failures.push(...validation.errors);
if(first.length!==expectedSaleCount){
  failures.push(
    "task count does not equal supporting sale count: "+
    first.length+" vs "+expectedSaleCount
  );
}
if(JSON.stringify(first)!==JSON.stringify(second)){
  failures.push("verification task derivation is not deterministic");
}

const contributionByCard=new Map(
  (queue.items||[]).map(item=>[item.card_id,item])
);
const seenTaskIds=new Set();
for(const task of first){
  if(seenTaskIds.has(task.task_id)){
    failures.push("duplicate task id: "+task.task_id);
  }
  seenTaskIds.add(task.task_id);

  const contribution=contributionByCard.get(task.card_id);
  if(!contribution){
    failures.push("task does not resolve to queue contribution: "+task.task_id);
    continue;
  }
  const record=recordsBySource[contribution.market_source_file];
  const sale=record?.sales?.[task.sale_index];
  if(!sale){
    failures.push("task does not resolve to source sale: "+task.task_id);
    continue;
  }

  if(task.market_source_file!==contribution.market_source_file){
    failures.push("task market source mismatch: "+task.task_id);
  }
  if(task.contribution_priority_rank!==Number(contribution.priority_rank)){
    failures.push("task priority mismatch: "+task.task_id);
  }
  if(task.sale_date!==(sale.sale_date||null)){
    failures.push("task sale date mismatch: "+task.task_id);
  }
  if(Number(task.sale_price_usd)!==Number(sale.sale_price)){
    failures.push("task sale price mismatch: "+task.task_id);
  }
  if(task.marketplace!==(sale.marketplace||null)){
    failures.push("task marketplace mismatch: "+task.task_id);
  }
}

const summary=model.summary(first);
const pending=model.pending(first);
const next=model.next(first);
if(summary.task_count!==expectedSaleCount){
  failures.push("task summary count mismatch");
}
if(summary.pending_task_count!==pending.length){
  failures.push("pending task summary mismatch");
}
if(next!==null && next.task_id!==pending[0]?.task_id){
  failures.push("next task does not equal first deterministic pending task");
}
if(first.length){
  const minRank=Math.min(
    ...(queue.items||[]).map(item=>Number(item.priority_rank))
  );
  if(first[0].contribution_priority_rank!==minRank){
    failures.push("first task does not use highest-priority contribution");
  }
}

console.log(JSON.stringify({
  result:failures.length?"fail":"pass",
  contribution_count:(queue.items||[]).length,
  market_record_count:Object.keys(recordsBySource).length,
  supporting_sale_count:expectedSaleCount,
  derived_task_count:first.length,
  original_verified_task_count:summary.original_verified_task_count,
  pending_task_count:summary.pending_task_count,
  next_task:next?{
    task_id:next.task_id,
    contribution_priority_rank:next.contribution_priority_rank,
    player:next.player,
    parallel:next.parallel,
    sale_index:next.sale_index,
    sale_date:next.sale_date,
    sale_price_usd:next.sale_price_usd,
    marketplace:next.marketplace
  }:null,
  failed_count:failures.length,
  failures
},null,2));

if(failures.length) process.exit(1);
