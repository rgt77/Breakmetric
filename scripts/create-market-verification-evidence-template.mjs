import fs from "node:fs";
import path from "node:path";
import {
  buildVerificationTasks,
  nextPendingTask,
  createEvidenceTemplate
} from "./lib/market-verification-template.mjs";

const root=process.cwd();
const args=process.argv.slice(2);
const valueAfter=flag=>{
  const index=args.indexOf(flag);
  return index>=0 ? args[index+1] : null;
};

const queuePath=
  valueAfter("--queue") ||
  "data/market/2026-topps-chrome-premier-league/market-verification-queue-v1.json";
const team=valueAfter("--team");
const taskId=valueAfter("--task-id");
const verifiedAt=valueAfter("--verified-at")||"";
const output=valueAfter("--output");

const absoluteQueue=path.join(root,queuePath);
if(!fs.existsSync(absoluteQueue)){
  console.error("Verification queue not found: "+queuePath);
  process.exit(2);
}

const queue=JSON.parse(fs.readFileSync(absoluteQueue,"utf8"));
const recordsBySource={};
for(const contribution of queue.items||[]){
  if(team && contribution.team!==team) continue;
  const source=contribution.market_source_file;
  if(!source || recordsBySource[source]) continue;
  const absoluteSource=path.join(root,source);
  if(!fs.existsSync(absoluteSource)){
    console.error("Market record not found: "+source);
    process.exit(2);
  }
  recordsBySource[source]=JSON.parse(
    fs.readFileSync(absoluteSource,"utf8")
  );
}

const tasks=buildVerificationTasks({
  queue,
  recordsBySource,
  team:team||null
});
const task=nextPendingTask(tasks,taskId||null);

if(!task){
  console.error(JSON.stringify({
    result:"fail",
    reason:taskId
      ? "requested pending verification task not found"
      : "no pending verification task found",
    team:team||null,
    task_id:taskId||null
  },null,2));
  process.exit(1);
}

const template=createEvidenceTemplate(task,{
  queuePath,
  verifiedAt
});
const serialized=JSON.stringify(template,null,2)+"\n";

if(output){
  const absoluteOutput=path.resolve(root,output);
  if(fs.existsSync(absoluteOutput)){
    console.error("Refusing to overwrite existing evidence template: "+output);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(absoluteOutput),{recursive:true});
  fs.writeFileSync(absoluteOutput,serialized);
  console.log(JSON.stringify({
    result:"written",
    task_id:task.task_id,
    output:path.relative(root,absoluteOutput),
    next_command:
      "Fill direct_marketplace_url or source_sale_id and verified_at, then dry-run: "+
      "node scripts/apply-market-verification-evidence.mjs --evidence "+
      path.relative(root,absoluteOutput)
  },null,2));
}else{
  process.stdout.write(serialized);
}
