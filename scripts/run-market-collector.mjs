import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root=process.cwd();
const args=process.argv.slice(2);
const valueAfter=flag=>{const i=args.indexOf(flag);return i>=0?args[i+1]:null;};
const configPath=valueAfter("--config")||"data/collection/continuous-market-collector-config-v1.json";
const dryRun=args.includes("--dry-run");
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),"utf8"));
const exists=file=>fs.existsSync(path.join(root,file));
const stable=value=>JSON.stringify(value,null,2)+"\n";
const now=()=>new Date().toISOString();
const hash=value=>crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const fail=(stage,message)=>{const error=new Error(message);error.stage=stage;throw error;};

const config=read(configPath);
const queuePath=config.priority_queue?.source;
const required=["product_id","format_id","observation_file","automated_valuation_file"];
for(const key of required) if(!config[key]) fail("preflight",`Missing config field: ${key}`);
if(!queuePath||!exists(queuePath)) fail("preflight","Priority queue is missing.");
const queue=read(queuePath);
if(!Array.isArray(queue.tasks)) fail("preflight","Priority queue tasks are invalid.");
const ids=new Set();
for(const task of queue.tasks){
  if(!task.task_id||ids.has(task.task_id)) fail("preflight","Priority queue contains invalid or duplicate task IDs.");
  ids.add(task.task_id);
  if(!(Number(task.expected_copies_per_case)>0)) fail("preflight",`Priority task has invalid expected copies: ${task.task_id}`);
}
const generated=queue.generated_at?Date.parse(queue.generated_at):NaN;
const staleHours=Number(config.priority_queue?.fail_closed_if_stale_hours||24);
if(Number.isFinite(generated)&&Date.now()-generated>staleHours*3600000) fail("preflight","Priority queue is stale.");

const provider=config.fast_lane?.provider;
const credentialEnv=config.fast_lane?.credential_env;
const credential=credentialEnv?process.env[credentialEnv]:null;
if(!dryRun&&!credential) fail("preflight",`Missing provider credential: ${credentialEnv}`);

const statePath=config.telemetry?.state_file||"ops/collector/state-v1.json";
const previous=exists(statePath)?read(statePath):{};
const sequence=Number(previous.sequence||0)+1;
const runId=`collector-${now().replace(/[-:.]/g,"").replace("Z","Z")}-${sequence}`;
const configFingerprint=hash({...config,credential:undefined});
const batchSize=Number(config.fast_lane?.batch_size||20);
const tasks=queue.tasks.slice(0,batchSize);
const uniqueTasks=tasks.filter((task,index,array)=>array.findIndex(row=>row.task_id===task.task_id)===index;
if(uniqueTasks.length!==tasks.length) fail("task-selection","Selected batch contains duplicate task IDs.");
const run={
  schema_version:1,run_id:runId,sequence,provider,product_id:config.product_id,
  format_id:config.format_id,started_at:now(),completed_at:null,status:"running",
  dry_run:dryRun,config_fingerprint:configFingerprint,queue_source:queuePath,
  counts:{requested:tasks.length,processed:0,deferred:0,failed:0,exact_matches:0,duplicates_skipped:0},
  stages:[{name:"preflight",status:"passed",completed_at:now()}],
  tasks:tasks.map(task=>({task_id:task.task_id,priority:task.priority,status:dryRun?"validated":"pending"}))
};
if(dryRun){
  run.counts.processed=tasks.length;
  run.status="complete";
  run.completed_at=now();
  run.stages.push({name:"task-selection",status:"passed",completed_at:now()});
  process.stdout.write(stable(run));
  process.exit(0);
}

// Network/provider execution intentionally remains fail-closed until the exact
// SportsCardsPro request/response adapter is implemented and QA-verified.
fail("provider-adapter","Live provider adapter not implemented; no market observation was mutated.");
