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
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const atomicWrite=(file,value)=>{const target=path.join(root,file);fs.mkdirSync(path.dirname(target),{recursive:true});const temp=target+".tmp";fs.writeFileSync(temp,stable(value));fs.renameSync(temp,target);};
const readOr=(file,fallback)=>exists(file)?read(file):structuredClone(fallback);
const normalize=value=>String(value??"").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g," ").trim();
const taskQuery=task=>[task.subject,task.card_number,task.parallel,task.set,"2026 Topps Chrome Premier League"].filter(Boolean).join(" ");
const apiBase="https://www.sportscardspro.com";
const apiJson=async(endpoint,params)=>{const url=new URL(endpoint,apiBase);for(const [k,v] of Object.entries(params))url.searchParams.set(k,v);const response=await fetch(url,{headers:{"accept":"application/json","user-agent":"BreakMetric/1.0"}});let body;try{body=await response.json();}catch{fail("provider-response","Provider returned non-JSON response.");}if(!response.ok||body?.status==="error")fail("provider-response",body?.["error-message"]||`Provider HTTP ${response.status}`);return body;};
const searchProvider=(token,task)=>apiJson("/api/products",{t:token,q:taskQuery(task)});
const fetchProviderProduct=(token,id)=>apiJson("/api/product",{t:token,id:String(id)});
const identityScore=(task,item)=>{const name=normalize(item?.["product-name"]);const set=normalize(item?.["console-name"]);const subject=normalize(task.subject);const card=normalize(task.card_number);const parallel=normalize(task.parallel);let score=0;if(subject&&name.includes(subject))score+=4;if(card&&name.includes(card))score+=3;if(parallel&&parallel!=="base"&&name.includes(parallel))score+=2;if(set.includes("topps chrome")&&set.includes("premier league"))score+=3;return score;};
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
const uniqueTasks=tasks.filter((task,index,array)=>array.findIndex(row=>row.task_id===task.task_id)===index);
if(uniqueTasks.length!==tasks.length) fail("task-selection","Selected batch contains duplicate task IDs.");
const fairnessCaps={team:Number(config.fast_lane?.priority_queue_max_tasks_per_team||3),subject:Number(config.fast_lane?.priority_queue_max_tasks_per_subject||2)};
const fairnessCounts={team:{},subject:{}};
for(const task of tasks){fairnessCounts.team[task.team]=(fairnessCounts.team[task.team]||0)+1;const subject=task.subject||"";fairnessCounts.subject[subject]=(fairnessCounts.subject[subject]||0)+1;}
const taskClaims=Object.fromEntries(tasks.map(task=>[task.task_id,{run_id:runId,claimed_at:now(),status:"claimed"}]));
const providerPolicy={min_request_interval_ms:Number(config.fast_lane?.min_request_interval_ms||1100),max_attempts:Number(config.retry?.max_attempts||3),retry_http_statuses:[...(config.retry?.retry_http_statuses||[])]};
const qualityPolicy={min_price_usd:Number(config.quality?.min_price_usd||0.01),max_price_usd:Number(config.quality?.max_price_usd||1000000),exact_identity_required:config.safety?.exact_identity_required===true};
const observationPolicy={append_only:true,required_fields:["task_id","provider","provider_product_id","observed_at","raw_price_usd"],canonical_ev_eligible:false};
const feedbackPlan=[...(config.feedback_loop?.sequence||[])];
if(feedbackPlan.length<5) fail("preflight","Feedback plan is incomplete.");
const completionRequirements={all_stages_passed:true,qa_required:config.feedback_loop?.qa?.required_after_each_step===true,no_partial_promotion:config.feedback_loop?.execution?.partial_promotion_allowed===false};
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
