import fs from "node:fs";
import path from "node:path";
import {
  assessVerificationCandidate,
  evidenceFromCandidate
} from "./lib/market-verification-candidate.mjs";

const root=process.cwd();
const args=process.argv.slice(2);
const valueAfter=flag=>{
  const index=args.indexOf(flag);
  return index>=0 ? args[index+1] : null;
};

const candidatePath=valueAfter("--candidate");
const emitEvidence=valueAfter("--emit-evidence");

if(!candidatePath){
  console.error(
    "Usage: node scripts/assess-market-verification-candidate.mjs "+
    "--candidate <file.json> [--emit-evidence <file.json>]"
  );
  process.exit(2);
}

const absoluteCandidate=path.resolve(root,candidatePath);
if(!fs.existsSync(absoluteCandidate)){
  console.error("Candidate file not found: "+candidatePath);
  process.exit(2);
}

const candidate=JSON.parse(
  fs.readFileSync(absoluteCandidate,"utf8")
);
const queuePath=
  candidate.queue_path ||
  "data/market/2026-topps-chrome-premier-league/market-verification-queue-v1.json";
const absoluteQueue=path.join(root,queuePath);
if(!fs.existsSync(absoluteQueue)){
  console.error("Verification queue not found: "+queuePath);
  process.exit(2);
}

const queue=JSON.parse(
  fs.readFileSync(absoluteQueue,"utf8")
);
const saleIndex=Number(candidate.sale_index);
const contribution=(queue.items||[]).find(item=>{
  const taskId=[
    queue.product_id,
    queue.format_id,
    item.team,
    item.card_id,
    saleIndex
  ].join("::");
  return taskId===candidate.task_id;
});

if(!contribution){
  console.error(JSON.stringify({
    result:"fail",
    reason:"candidate task_id does not resolve to verification queue"
  },null,2));
  process.exit(1);
}

const source=contribution.market_source_file;
if(!source || !fs.existsSync(path.join(root,source))){
  console.error(JSON.stringify({
    result:"fail",
    reason:"candidate market source file missing",
    market_source_file:source||null
  },null,2));
  process.exit(1);
}

const record=JSON.parse(
  fs.readFileSync(path.join(root,source),"utf8")
);

const catalog=JSON.parse(
  fs.readFileSync(path.join(root,"data/products/catalog.json"),"utf8")
);
const productEntry=(catalog.products||[])
  .find(item=>item.id===record.product_id);
if(!productEntry?.product_data){
  console.error(JSON.stringify({
    result:"fail",
    reason:"market record product identity is not routed in product catalog",
    product_id:record.product_id||null
  },null,2));
  process.exit(1);
}
const product=JSON.parse(
  fs.readFileSync(path.join(root,productEntry.product_data),"utf8")
);

const sale=record.sales?.[saleIndex];
const task={
  task_id:candidate.task_id,
  contribution_priority_rank:Number(contribution.priority_rank),
  sale_index:saleIndex,
  product_id:queue.product_id,
  card_number:record.card_number,
  serial_numbering:
    record.serial_numbering===null ||
    record.serial_numbering===undefined
      ? null
      : Number(record.serial_numbering),
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

const assessment=assessVerificationCandidate({
  task,
  record,
  product,
  candidate
});

let emitted=null;
if(emitEvidence){
  const result=evidenceFromCandidate({
    task,
    record,
    product,
    candidate
  });
  if(!result.created){
    console.error(JSON.stringify({
      result:"fail",
      reason:"candidate is not eligible for evidence promotion",
      assessment:result.assessment
    },null,2));
    process.exit(1);
  }

  const absoluteOutput=path.resolve(root,emitEvidence);
  if(fs.existsSync(absoluteOutput)){
    console.error("Refusing to overwrite existing evidence file: "+emitEvidence);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(absoluteOutput),{recursive:true});
  fs.writeFileSync(
    absoluteOutput,
    JSON.stringify(result.evidence,null,2)+"\n"
  );
  emitted=path.relative(root,absoluteOutput);
}

console.log(JSON.stringify({
  result:"pass",
  task_id:task.task_id,
  status:assessment.status,
  eligible_for_evidence:assessment.eligible_for_evidence,
  blockers:assessment.blockers,
  emitted_evidence:emitted
},null,2));
