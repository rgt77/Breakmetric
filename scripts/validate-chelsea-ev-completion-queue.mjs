import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const j=file=>JSON.parse(fs.readFileSync(path.join(root,file),"utf8"));
const fail=[];
const ok=(x,m)=>{if(!x) fail.push(m);};
const rnd=x=>Math.round(Number(x)*1e8)/1e8;
const med=xs=>{
  xs=xs.filter(Number.isFinite).sort((a,b)=>a-b);
  if(!xs.length) return null;
  const m=Math.floor(xs.length/2);
  return xs.length%2?xs[m]:(xs[m-1]+xs[m])/2;
};

const product="2026-topps-chrome-premier-league";
const queue=j("data/derived/"+product+"-hobby-chelsea-ev-completion-queue-v1.json");
const anchor=j("data/derived/"+product+"-hobby-chelsea-market-anchor-v1.json");
const inventory=j("data/derived/"+product+"-hobby-ev-eligible-inventory-v1.json");
const provenance=j("data/derived/"+product+"-hobby-ev-contribution-provenance-v1.json");
const insertMap=j("data/mappings/"+product+"-hobby-insert-odds-map.json");
const method=j("data/methodology/chelsea-ev-completion-priority-v1.json");
const research=j("data/market/"+product+"/ev-valuation-research-v1.json");

const insertSets=new Set(
  (insertMap.mappings||[]).flatMap(x=>x.checklist_sections||[x.checklist_section]).filter(Boolean)
);
const cat=e=>e.set==="Base Cards"?"base_parallels":insertSets.has(e.set)?"inserts":"autographs";
const key=x=>[x.category,x.team,x.set,String(x.card_number),x.parallel].join("|");

const eligible=new Set();
for(const card of (inventory.cards||[]).filter(x=>x.team==="Chelsea")){
  for(const parallel of card.canonical_variants||[]){
    eligible.add(key({...card,parallel}));
  }
}
ok(eligible.size===638,"eligible != 638");

const valued=new Set();
const valuedCounts={base_parallels:0,inserts:0,autographs:0};
const observations=[];
for(const e of provenance.entries||[]){
  if(e.team!=="Chelsea") continue;
  const category=cat(e);
  const matches=(inventory.cards||[]).filter(card=>
    card.team===e.team && card.category===category && card.set===e.set &&
    card.canonical_variants?.includes(e.parallel) &&
    (!e.player || card.subjects?.includes(e.player))
  );
  ok(matches.length===1,"cannot resolve "+e.card_id);
  if(matches.length===1){
    valued.add(key({
      category,team:e.team,set:e.set,
      card_number:matches[0].card_number,parallel:e.parallel
    }));
    valuedCounts[category]=(valuedCounts[category]||0)+1;
  }
  const ev=j(e.derived_ev_file);
  observations.push({
    subject:e.player,category,value:Number(ev.market_value_usd)
  });
}

const queued=new Set();
const counts={base_parallels:0,inserts:0,autographs:0};
let attemptedSeen=false;
for(const [i,t] of (queue.tasks||[]).entries()){
  const k=key(t);
  ok(t.rank===i+1,"rank gap "+k);
  ok(!queued.has(k),"duplicate "+k);
  queued.add(k);
  ok(eligible.has(k),"ineligible "+k);
  ok(!valued.has(k),"valued queued "+k);
  ok(Number(t.expected_copies_per_case)>0,"bad expected "+k);
  ok(Number(t.market_anchor?.median_market_value_usd)>0,"bad anchor "+k);
  ok(
    rnd(Number(t.expected_copies_per_case)*Number(t.market_anchor?.median_market_value_usd))===
      Number(t.economic_priority_proxy_usd),
    "bad proxy "+k
  );
  ok(t.proxy_semantics?.includes("research ordering only"),"proxy warning "+k);
  const attempted=t.valuation_research?.attempted===true;
  if(attempted) attemptedSeen=true;
  else ok(!attemptedSeen,"untouched task appears after attempted task "+k);
  counts[t.category]=(counts[t.category]||0)+1;
}
ok(queued.size===eligible.size-valued.size,"queued count does not equal eligible - valued");
for(const k of eligible) ok(valued.has(k)||queued.has(k),"missing "+k);
for(const category of ["base_parallels","inserts","autographs"]){
  const eligibleCount=Number(
    inventory.teams?.Chelsea?.[category]?.eligible_contribution_count||0
  );
  ok(
    Number(counts[category]||0)===
      eligibleCount-Number(valuedCounts[category]||0),
    "category count "+category
  );
}
ok(
  queue.summary?.eligible_chelsea_contribution_count===eligible.size &&
  queue.summary?.already_valued_contribution_count===valued.size &&
  queue.summary?.remaining_task_count===queued.size,
  "summary counts"
);

const queueByTaskId=new Map((queue.tasks||[]).map(task=>[task.task_id,task]));
for(const attempt of research.attempts||[]){
  const task=queueByTaskId.get(attempt.task_id);
  if(attempt.outcome==="no-exact-realized-sales"){
    ok(Boolean(task),"blocked research task must remain queued: "+attempt.task_id);
    ok(
      task?.valuation_research?.attempted===true &&
      task?.valuation_research?.outcome===attempt.outcome,
      "blocked research state mismatch: "+attempt.task_id
    );
  }else if(attempt.outcome==="valued-secondary-realized-sales"){
    ok(!task,"valued research task must leave queue: "+attempt.task_id);
  }
}

const teamValues=observations.map(x=>x.value);
ok(rnd(med(teamValues))===Number(anchor.team?.median_market_value_usd),"team median");
ok(teamValues.length===Number(anchor.team?.observation_count),"team count");

for(const category of ["base_parallels","inserts","autographs"]){
  const values=observations.filter(x=>x.category===category).map(x=>x.value);
  const stored=anchor.categories?.[category];
  ok(values.length===Number(stored?.observation_count||0),"category count "+category);
  const m=med(values);
  ok(
    m===null ? stored?.median_market_value_usd===null :
      rnd(m)===Number(stored?.median_market_value_usd),
    "category median "+category
  );
  ok(
    Boolean(stored?.eligible_as_fallback)===
      (values.length>=Number(anchor.minimum_category_observations_for_fallback)),
    "category fallback "+category
  );
}

const subjects=[...new Set(observations.map(x=>x.subject))].sort();
ok(
  JSON.stringify(subjects)===JSON.stringify(Object.keys(anchor.subjects||{}).sort()),
  "subject set"
);
for(const subject of subjects){
  const all=observations.filter(x=>x.subject===subject).map(x=>x.value);
  ok(all.length===Number(anchor.subjects[subject].all.observation_count),"subject count "+subject);
  ok(rnd(med(all))===Number(anchor.subjects[subject].all.median_market_value_usd),"subject median "+subject);
  for(const category of ["base_parallels","inserts","autographs"]){
    const values=observations.filter(x=>x.subject===subject&&x.category===category).map(x=>x.value);
    const stored=anchor.subjects[subject][category];
    if(!values.length){ok(stored===undefined,"empty subject/category "+subject+"/"+category);continue;}
    ok(values.length===Number(stored?.observation_count),"subject/category count "+subject+"/"+category);
    ok(rnd(med(values))===Number(stored?.median_market_value_usd),"subject/category median "+subject+"/"+category);
  }
}

ok(method.economic_priority_proxy?.interpretation==="Research-order proxy only.","method proxy semantics");
ok(method.completion_rule?.includes("638 eligible contribution slots"),"method completion rule");

console.log(JSON.stringify({
  result:fail.length?"fail":"pass",
  eligible_slot_count:eligible.size,
  valued_slot_count:valued.size,
  queued_slot_count:queued.size,
  category_remaining_task_count:counts,
  top_task:queue.tasks?.[0]?.task_id||null,
  failures:fail
},null,2));
if(fail.length) process.exit(1);
