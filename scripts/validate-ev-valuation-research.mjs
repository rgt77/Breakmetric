import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const j=file=>JSON.parse(fs.readFileSync(path.join(root,file),"utf8"));
const exists=file=>fs.existsSync(path.join(root,file));
const failures=[];
const ok=(condition,message)=>{if(!condition) failures.push(message);};

const product="2026-topps-chrome-premier-league";
const research=j("data/market/"+product+"/ev-valuation-research-v1.json");
const provenance=j("data/derived/"+product+"-hobby-ev-contribution-provenance-v1.json");
const teamEv=j("data/derived/"+product+"-team-ev-progress.json");
const queue=j("data/derived/"+product+"-hobby-chelsea-ev-completion-queue-v1.json");
const frozen=j("data/market/"+product+"/market-verification-scope-v1.json");
const legacyQueue=j("data/market/"+product+"/market-verification-queue-v1.json");

const attempts=research.attempts||[];
ok(attempts.length===10,"valuation research block must contain 10 attempts");
ok(new Set(attempts.map(x=>x.step)).size===10,"valuation research steps must be unique");
ok(
  attempts.every((x,index)=>x.step===827+index),
  "valuation research steps must be contiguous 827-836"
);
ok(new Set(attempts.map(x=>x.task_id)).size===attempts.length,"valuation task ids must be unique");
ok(attempts.every(x=>x.exact_series_identity===true),"every attempt must enforce exact series identity");

const valued=attempts.filter(x=>x.outcome==="valued-secondary-realized-sales");
const blocked=attempts.filter(x=>x.outcome==="no-exact-realized-sales");
ok(valued.length===5,"exactly five tasks should be valued");
ok(blocked.length===5,"exactly five tasks should remain blocked");

const provByCardId=new Map((provenance.entries||[]).map(x=>[x.card_id,x]));
const queueByTaskId=new Map((queue.tasks||[]).map(x=>[x.task_id,x]));
let evSum=0;
for(const attempt of valued){
  ok(Number(attempt.raw_realized_sale_count)>0,"valued attempt lacks realized sales: "+attempt.task_id);
  ok(Number(attempt.market_value_usd)>0,"valued attempt lacks market value: "+attempt.task_id);
  ok(Boolean(attempt.market_source_file)&&exists(attempt.market_source_file),"valued attempt lacks market record: "+attempt.task_id);
  ok(Boolean(attempt.derived_ev_file)&&exists(attempt.derived_ev_file),"valued attempt lacks derivation: "+attempt.task_id);
  ok(!queueByTaskId.has(attempt.task_id),"valued task remains in completion queue: "+attempt.task_id);
  const derived=attempt.derived_ev_file&&exists(attempt.derived_ev_file)?j(attempt.derived_ev_file):null;
  if(derived){
    ok(Math.abs(Number(derived.market_value_usd)-Number(attempt.market_value_usd))<1e-9,"derived market value mismatch: "+attempt.task_id);
    ok(Math.abs(Number(derived.calculation?.ev_contribution_usd)-Number(attempt.ev_contribution_usd))<0.001,"derived EV mismatch: "+attempt.task_id);
  }
  evSum+=Number(attempt.ev_contribution_usd||0);
}
for(const attempt of blocked){
  ok(Number(attempt.raw_realized_sale_count)===0,"blocked attempt unexpectedly has realized sales: "+attempt.task_id);
  ok(typeof attempt.blocker==="string"&&attempt.blocker.length>0,"blocked attempt lacks blocker: "+attempt.task_id);
  const task=queueByTaskId.get(attempt.task_id);
  ok(Boolean(task),"blocked task left completion queue: "+attempt.task_id);
  ok(task?.valuation_research?.attempted===true,"blocked queue task lacks research state: "+attempt.task_id);
}

ok(Math.abs(evSum-9.3102)<0.0001,"new EV sum mismatch");
ok(Number(research.summary?.chelsea_valued_contribution_count)===32,"research summary valued count mismatch");
ok(Number(research.summary?.chelsea_remaining_contribution_count)===606,"research summary remaining count mismatch");
ok(Number(teamEv.teams?.Chelsea?.valued_card_count)===32,"team EV valued count mismatch");
ok(Math.abs(Number(teamEv.teams?.Chelsea?.partial_ev_sum_check_usd)-52.0313)<0.0001,"team EV partial sum mismatch");
ok(Number(queue.summary?.already_valued_contribution_count)===32,"completion queue valued count mismatch");
ok(Number(queue.summary?.remaining_task_count)===606,"completion queue remaining count mismatch");

ok(Number(frozen.frozen_contribution_count)===27,"frozen market verification scope count changed");
ok((frozen.card_ids||[]).length===27,"frozen market verification id count changed");
ok(Number(legacyQueue.summary?.contribution_count)===27,"legacy market verification queue expanded");
ok(
  (legacyQueue.items||[]).every(item=>(frozen.card_ids||[]).includes(item.card_id)),
  "legacy market verification queue contains Phase-2 contribution"
);

console.log(JSON.stringify({
  result:failures.length?"fail":"pass",
  attempted_task_count:attempts.length,
  valued_task_count:valued.length,
  blocked_task_count:blocked.length,
  new_ev_contribution_usd:Math.round(evSum*10000)/10000,
  chelsea_valued_contribution_count:teamEv.teams?.Chelsea?.valued_card_count,
  chelsea_remaining_contribution_count:queue.summary?.remaining_task_count,
  legacy_verification_contribution_count:legacyQueue.summary?.contribution_count,
  failures
},null,2));

if(failures.length) process.exit(1);
