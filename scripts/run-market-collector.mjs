import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {spawnSync} from "node:child_process";

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
const taskQuery=task=>[task.subject,task.card_number,task.parallel,task.set].filter(Boolean).join(" ");
const apiBase="https://www.sportscardspro.com";
const apiJson=async(endpoint,params)=>{const url=new URL(endpoint,apiBase);for(const [k,v] of Object.entries(params))url.searchParams.set(k,v);const response=await fetch(url,{headers:{"accept":"application/json","user-agent":"BreakMetric/1.0"}});let body;try{body=await response.json();}catch{fail("provider-response","Provider returned non-JSON response.");}if(!response.ok||body?.status==="error"){const error=new Error(body?.["error-message"]||`Provider HTTP ${response.status}`);error.stage="provider-response";error.status=response.status;throw error;}return body;};
const searchProvider=(token,task)=>apiJson("/api/products",{t:token,q:taskQuery(task)});
const fetchProviderProduct=(token,id)=>apiJson("/api/product",{t:token,id:String(id)});
const identityScore=(task,item)=>{const name=normalize(item?.["product-name"]);const set=normalize(item?.["console-name"]);const subject=normalize(task.subject);const card=normalize(task.card_number);const parallel=normalize(task.parallel);const expectedSet=normalize(task.set);let score=0;if(subject&&name.includes(subject))score+=4;if(card&&name.includes(card))score+=3;if(parallel&&parallel!=="base"&&name.includes(parallel))score+=2;if(expectedSet&&set.includes(expectedSet))score+=3;return score;};
const fail=(stage,message)=>{const error=new Error(message);error.stage=stage;throw error;};

const chooseExactMatch=(task,items)=>{const ranked=(items||[]).map(item=>({item,score:identityScore(task,item)})).sort((a,b)=>b.score-a.score);if(!ranked.length||ranked[0].score<10)return null;if(ranked[1]&&ranked[1].score===ranked[0].score)return null;return ranked[0].item;};
const providerPriceUsd=item=>{const pennies=Number(item?.["loose-price"]);return Number.isFinite(pennies)&&pennies>0?Math.round(pennies)/100:null;};
const validPrice=price=>Number.isFinite(price)&&price>=Number(config.quality?.min_price_usd||0.01)&&price<=Number(config.quality?.max_price_usd||1000000);
const observationFor=(task,item,price,observedAt)=>({task_id:task.task_id,source:"sportscardspro-api",provider_product_id:String(item.id),provider_product_name:item["product-name"]||null,provider_set_name:item["console-name"]||null,source_url:`https://www.sportscardspro.com/game/${item.id}`,team:task.team,category:task.category,subjects:task.subject?[task.subject]:[],set:task.set,card_number:task.card_number||null,parallel:task.parallel,exact_identity:true,status:"exact-current-price",currency:"USD",raw_price_usd:price,observed_at:observedAt,canonical_ev_eligible:false});
const sameObservation=(a,b)=>a&&b&&a.provider_product_id===b.provider_product_id&&Number(a.raw_price_usd)===Number(b.raw_price_usd);
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
const sharingApprovalEnv=config.licensing?.approval_env;
const sharingApproved=sharingApprovalEnv?process.env[sharingApprovalEnv]==="true":false;
if(!dryRun&&config.licensing?.public_sharing_requires_approval===true&&!sharingApproved) fail("preflight",`Missing commercial sharing approval: ${sharingApprovalEnv}`);

const statePath=config.telemetry?.state_file||"ops/collector/state-v1.json";
const previous=exists(statePath)?read(statePath):{};
const sequence=Number(previous.sequence||0)+1;
const runId=`collector-${now().replace(/[-:.]/g,"").replace("Z","Z")}-${sequence}`;
const configFingerprint=hash({...config,credential:undefined});
const batchSize=Number(config.fast_lane?.batch_size||20);
const fairnessCaps={team:Number(config.fast_lane?.priority_queue_max_tasks_per_team||3),subject:Number(config.fast_lane?.priority_queue_max_tasks_per_subject||2)};
const fairnessCounts={team:{},subject:{}};
const tasks=[];
for(const task of queue.tasks){
  if(tasks.length>=batchSize) break;
  const team=task.team||"",subject=task.subject||"";
  if((fairnessCounts.team[team]||0)>=fairnessCaps.team) continue;
  if(subject&&(fairnessCounts.subject[subject]||0)>=fairnessCaps.subject) continue;
  tasks.push(task);
  fairnessCounts.team[team]=(fairnessCounts.team[team]||0)+1;
  if(subject) fairnessCounts.subject[subject]=(fairnessCounts.subject[subject]||0)+1;
}
const uniqueTasks=tasks.filter((task,index,array)=>array.findIndex(row=>row.task_id===task.task_id)===index);
if(uniqueTasks.length!==tasks.length) fail("task-selection","Selected batch contains duplicate task IDs.");
const taskClaims=Object.fromEntries(tasks.map(task=>[task.task_id,{run_id:runId,claimed_at:now(),status:"claimed"}]));
const providerPolicy={min_request_interval_ms:Number(config.fast_lane?.min_request_interval_ms||1100),max_attempts:Number(config.retry?.max_attempts||3),retry_http_statuses:[...(config.retry?.retry_http_statuses||[])]};
const qualityPolicy={min_price_usd:Number(config.quality?.min_price_usd||0.01),max_price_usd:Number(config.quality?.max_price_usd||1000000),exact_identity_required:config.safety?.exact_identity_required===true};
const observationPolicy={storage_mode:"latest-by-task",append_only:false,required_fields:["task_id","provider","provider_product_id","observed_at","raw_price_usd"],canonical_ev_eligible:false};
const feedbackPlan=[...(config.feedback_loop?.sequence||[])];
if(feedbackPlan.length<5) fail("preflight","Feedback plan is incomplete.");
const completionRequirements={all_stages_passed:true,qa_required:config.feedback_loop?.qa?.required_after_each_step===true,no_partial_promotion:config.feedback_loop?.execution?.partial_promotion_allowed===false};
const observationsState=read(config.observation_file);
const observationsEntries=observationsState.entries||(observationsState.entries={});
const runProviderTask=async task=>{const search=await searchProvider(credential,task);const match=chooseExactMatch(task,search.products);if(!match)return {status:"no-exact-match"};await sleep(providerPolicy.min_request_interval_ms);const detail=await fetchProviderProduct(credential,match.id);const price=providerPriceUsd(detail);if(!validPrice(price))return {status:"invalid-price"};const observation=observationFor(task,detail,price,now());if(sameObservation(observationsEntries[task.task_id],observation))return {status:"duplicate",observation};return {status:"exact-match",observation};};
const persistObservation=observation=>{observationsEntries[observation.task_id]=observation;observationsState.generated_at=observation.observed_at;atomicWrite(config.observation_file,observationsState);};
const appendRun=entry=>{const file=config.telemetry?.runs_file||"ops/collector/runs-v1.json";const state=readOr(file,{schema_version:1,model:"collector-runs-v1",product_id:config.product_id,retained_run_limit:192,entries:[]});state.entries=[...(state.entries||[]),entry].slice(-Number(state.retained_run_limit||192));atomicWrite(file,state);};
const persistState=(status,reason=null)=>{const state=readOr(statePath,{schema_version:1,model:"collector-state-v1",product_id:config.product_id,format_id:config.format_id});state.sequence=sequence;state.updated_at=now();state.latest_run=runId;state.health={status,reason,evaluated_at:now()};atomicWrite(statePath,state);};
const refreshDerived=()=>{const result=spawnSync(process.execPath,["scripts/generate-automated-valuation-candidates.mjs","--config",configPath],{cwd:root,stdio:"inherit"});if(result.status!==0)fail("derived-refresh","Valuation candidate refresh failed.");};
const runProviderTaskWithRetry=async task=>{let lastError;for(let attempt=1;attempt<=providerPolicy.max_attempts;attempt++){try{return await runProviderTask(task);}catch(error){lastError=error;const retryable=error?.name==="AbortError"||error instanceof TypeError||providerPolicy.retry_http_statuses.includes(Number(error?.status));if(!retryable||attempt>=providerPolicy.max_attempts)throw error;await sleep(Math.min(Number(config.retry?.base_delay_ms||750)*2**(attempt-1),Number(config.retry?.max_delay_ms||8000)));}}throw lastError;};
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

let changed=0;
for(let index=0;index<tasks.length;index++){
  const task=tasks[index];
  try{
    const result=await runProviderTaskWithRetry(task);
    run.counts.processed++;
    run.tasks[index].status=result.status;
    if(result.status==="exact-match"){
      persistObservation(result.observation);
      run.counts.exact_matches++;
      changed++;
    }else if(result.status==="duplicate"){
      run.counts.duplicates_skipped++;
    }else{
      run.counts.deferred++;
    }
  }catch(error){
    run.counts.failed++;
    run.tasks[index].status="failed";
    run.tasks[index].error=String(error?.message||error);
  }
  if(index<tasks.length-1)await sleep(providerPolicy.min_request_interval_ms);
}
if(changed>0)refreshDerived();
run.status=run.counts.failed>0?"needs-review":"complete";
run.completed_at=now();
run.stages.push({name:"provider-collection",status:run.counts.failed>0?"failed":"passed",completed_at:run.completed_at});
appendRun({run_key:run.run_id,lane:"fast",provider,started_at:run.started_at,finished_at:run.completed_at,status:run.status,credential_present:true,tasks_checked:run.counts.processed,exact_matches:run.counts.exact_matches,changed_observations:changed,provider_errors:run.counts.failed});
persistState(run.status==="complete"?"healthy":"degraded",run.counts.failed>0?"provider-task-failures":null);
process.stdout.write(stable(run));
