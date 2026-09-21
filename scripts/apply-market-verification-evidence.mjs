import fs from "node:fs";
import path from "node:path";
import {
  applyEvidence
} from "./lib/market-verification-evidence.mjs";

const root=process.cwd();
const args=process.argv.slice(2);
const valueAfter=flag=>{
  const index=args.indexOf(flag);
  return index>=0 ? args[index+1] : null;
};
const evidencePath=valueAfter("--evidence");
const write=args.includes("--write");

if(!evidencePath){
  console.error(
    "Usage: node scripts/apply-market-verification-evidence.mjs "+
    "--evidence <file.json> [--write]"
  );
  process.exit(2);
}

const absoluteEvidence=path.resolve(root,evidencePath);
if(!fs.existsSync(absoluteEvidence)){
  console.error("Evidence file not found: "+evidencePath);
  process.exit(2);
}

const evidence=JSON.parse(fs.readFileSync(absoluteEvidence,"utf8"));
const queuePath=
  evidence.queue_path ||
  "data/market/2026-topps-chrome-premier-league/market-verification-queue-v1.json";

if(!fs.existsSync(path.join(root,queuePath))){
  console.error("Verification queue not found: "+queuePath);
  process.exit(2);
}

const queue=JSON.parse(
  fs.readFileSync(path.join(root,queuePath),"utf8")
);
const saleIndex=Number(evidence.sale_index);
const contribution=(queue.items||[]).find(item=>{
  const expectedTaskId=[
    queue.product_id,
    queue.format_id,
    item.team,
    item.card_id,
    saleIndex
  ].join("::");
  return expectedTaskId===evidence.task_id;
});

if(!contribution){
  console.error(JSON.stringify({
    result:"fail",
    reason:"evidence task_id does not resolve to verification queue"
  },null,2));
  process.exit(1);
}

const source=contribution.market_source_file;
if(!source || !fs.existsSync(path.join(root,source))){
  console.error(JSON.stringify({
    result:"fail",
    reason:"verification task market source file missing",
    market_source_file:source||null
  },null,2));
  process.exit(1);
}

const record=JSON.parse(
  fs.readFileSync(path.join(root,source),"utf8")
);
const sale=record.sales?.[saleIndex];
const task={
  task_id:evidence.task_id,
  contribution_priority_rank:Number(contribution.priority_rank),
  sale_index:saleIndex,
  team:contribution.team,
  card_id:contribution.card_id,
  player:contribution.player,
  set:contribution.set,
  parallel:contribution.parallel,
  ev_contribution_usd:Number(contribution.ev_contribution_usd||0),
  market_source_file:source,
  sale_date:sale?.sale_date||null,
  sale_price_usd:Number(sale?.sale_price),
  marketplace:sale?.marketplace||null,
  serial_copy:sale?.serial_copy||null
};

const beforePrices=(record.sales||[]).map(row=>Number(row.sale_price));
const result=applyEvidence({task,record,evidence});
const afterPrices=(result.record?.sales||[]).map(row=>Number(row.sale_price));

if(JSON.stringify(beforePrices)!==JSON.stringify(afterPrices)){
  console.error(JSON.stringify({
    result:"fail",
    reason:"evidence ingest attempted to change realized sale prices"
  },null,2));
  process.exit(1);
}

if(!result.applied){
  console.error(JSON.stringify({
    result:"fail",
    task_id:task.task_id,
    market_source_file:source,
    errors:result.errors
  },null,2));
  process.exit(1);
}

if(write){
  fs.writeFileSync(
    path.join(root,source),
    JSON.stringify(result.record,null,2)+"\n"
  );
}

console.log(JSON.stringify({
  result:write?"written":"dry-run-pass",
  task_id:task.task_id,
  market_source_file:source,
  sale_index:saleIndex,
  contribution_original_marketplace_verified:
    result.contribution_original_marketplace_verified,
  next_commands:write?[
    "node scripts/generate-v13-pipeline.mjs",
    "node scripts/generate-data-version.mjs",
    "node scripts/validate-market-records.mjs",
    "node scripts/validate-market-verification-contract.mjs",
    "node scripts/validate-market-verification-tasks.mjs"
  ]:[]
},null,2));
