import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const product="2026-topps-chrome-premier-league";
const team="Chelsea";
const check=process.argv.includes("--check");

const readJson=file=>JSON.parse(fs.readFileSync(path.join(root,file),"utf8"));
const stable=value=>JSON.stringify(value,null,2)+"\n";
const round=value=>Math.round(Number(value)*1e8)/1e8;
const median=values=>{
  const xs=values.filter(Number.isFinite).sort((a,b)=>a-b);
  if(!xs.length) return null;
  const m=Math.floor(xs.length/2);
  return xs.length%2 ? xs[m] : (xs[m-1]+xs[m])/2;
};

const paths={
  inventory:"data/derived/"+product+"-hobby-ev-eligible-inventory-v1.json",
  provenance:"data/derived/"+product+"-hobby-ev-contribution-provenance-v1.json",
  anchor:"data/derived/"+product+"-hobby-chelsea-market-anchor-v1.json",
  valuationResearch:"data/market/"+product+"/ev-valuation-research-v1.json",
  baseOdds:"data/odds/"+product+"-hobby-base.json",
  insertMap:"data/mappings/"+product+"-hobby-insert-odds-map.json",
  autoMap:"data/mappings/"+product+"-hobby-autograph-odds-map.json",
  inserts:"data/checklists/"+product+"-hobby-inserts.json",
  mainAutos:"data/checklists/"+product+"-chrome-autographs.json",
  specialAutos:"data/checklists/"+product+"-hobby-special-autographs.json",
  format:"data/formats/"+product+".json",
  output:"data/derived/"+product+"-hobby-chelsea-ev-completion-queue-v1.json"
};

const inventory=readJson(paths.inventory);
const provenance=readJson(paths.provenance);
const anchor=readJson(paths.anchor);
const valuationResearch=readJson(paths.valuationResearch);
const baseOdds=readJson(paths.baseOdds);
const insertMap=readJson(paths.insertMap);
const autoMap=readJson(paths.autoMap);
const inserts=readJson(paths.inserts);
const mainAutos=readJson(paths.mainAutos);
const specialAutos=readJson(paths.specialAutos);
const format=readJson(paths.format);
const hobby=(format.formats||[]).find(row=>row.id==="hobby");
if(!hobby || hobby.status!=="ready") throw new Error("Ready Hobby format missing");
const packsPerCase=Number(hobby.analysis_unit?.packs);
const boxesPerCase=Number(hobby.analysis_unit?.boxes);
if(!(packsPerCase>0) || !(boxesPerCase>0)){
  throw new Error("Hobby case dimensions missing");
}

const canonicalVariant=value=>{
  const name=String(value||"").trim();
  if(name==="Frozenfractors") return "Frozenfractor";
  if(/^(Aqua|Blue|Green|Purple|Gold|Orange|Black|Red) Wave$/.test(name)){
    return name+" Refractor";
  }
  return name;
};

const insertSectionNames=new Set(
  (insertMap.mappings||[]).flatMap(mapping=>
    mapping.checklist_sections||[mapping.checklist_section]
  ).filter(Boolean)
);

const categoryForContribution=entry=>{
  if(entry.set==="Base Cards") return "base_parallels";
  if(insertSectionNames.has(entry.set)) return "inserts";
  return "autographs";
};

const slotKey=({category,team,set,card_number,parallel})=>
  [category,team,set,String(card_number),parallel].join("|");

const valuedKeys=new Set();
const valuedByCategory={base_parallels:0,inserts:0,autographs:0};
for(const entry of provenance.entries||[]){
  if(entry.team!==team) continue;
  const category=categoryForContribution(entry);
  const matches=(inventory.cards||[]).filter(card=>
    card.team===entry.team &&
    card.category===category &&
    card.set===entry.set &&
    card.canonical_variants?.includes(entry.parallel) &&
    (!entry.player || card.subjects?.includes(entry.player))
  );
  if(matches.length!==1){
    throw new Error(
      "Cannot resolve valued contribution to one eligible slot: "+
      entry.card_id+" -> "+matches.length
    );
  }
  valuedKeys.add(slotKey({
    category,
    team:entry.team,
    set:entry.set,
    card_number:matches[0].card_number,
    parallel:entry.parallel
  }));
  valuedByCategory[category]=(valuedByCategory[category]||0)+1;
}

const researchAttemptByTaskId=new Map(
  (valuationResearch.attempts||[]).map(attempt=>[attempt.task_id,attempt])
);

function mappingForSet(mappings,set){
  return (mappings||[]).find(mapping=>
    mapping.checklist_section===set ||
    (mapping.checklist_sections||[]).includes(set)
  )||null;
}

function poolSize(mapping){
  if(Number(mapping?.pooled_checklist_size)>0){
    return Number(mapping.pooled_checklist_size);
  }
  if(Number(mapping?.checklist_size)>0){
    return Number(mapping.checklist_size);
  }
  const names=mapping?.checklist_sections||[mapping?.checklist_section];
  let count=0;
  for(const name of names.filter(Boolean)){
    if(name==="Chrome Autograph Cards"){
      count+=(mainAutos.cards||[]).length;
      continue;
    }
    const special=(specialAutos.sections||[]).find(section=>section.name===name);
    if(special){
      count+=(special.cards||[]).length;
      continue;
    }
    const insert=(inserts.sections||[]).find(section=>section.name===name);
    if(insert) count+=(insert.cards||[]).length;
  }
  return count;
}

function expectedFromOddsRow(row,pool){
  if(!(pool>0)) throw new Error("Invalid odds pool size");
  const type=row.type||row.odds_type||"pack_odds";
  let totalExpected=0;
  if(type==="per_box"){
    const quantity=Number(row.value??row.quantity??0);
    if(!(quantity>0)) throw new Error("Invalid per-box odds row");
    totalExpected=boxesPerCase*quantity;
  }else{
    const denominator=Number(row.denominator||0);
    if(!(denominator>0)) throw new Error("Invalid pack-odds row");
    totalExpected=packsPerCase/denominator;
  }
  return totalExpected/pool;
}

function slotOdds(card,parallel){
  if(card.category==="base_parallels"){
    const cardNumber=Number(card.card_number);
    const rows=cardNumber===201
      ? (baseOdds.hobby_exclusive_card_201||[])
      : (baseOdds.base_cards||[]);
    const row=rows.find(item=>canonicalVariant(item.name)===parallel);
    if(!row) throw new Error("Base odds row missing: "+card.card_number+" / "+parallel);
    const pool=cardNumber===201 ? 1 : 200;
    return {
      expected_copies_per_case:round(expectedFromOddsRow(row,pool)),
      pool_size:pool,
      odds_basis:
        (row.odds_type==="per_box"
          ? String(row.quantity)+" per box"
          : "1:"+String(row.denominator)+" per pack"),
      odds_source:"base-card-odds"
    };
  }

  const mappings=card.category==="inserts"
    ? insertMap.mappings
    : autoMap.mappings;
  const mapping=mappingForSet(mappings,card.set);
  if(!mapping) throw new Error("Odds mapping missing: "+card.set);
  const row=(mapping.odds_rows||[])
    .find(item=>canonicalVariant(item.variant)===parallel);
  if(!row) throw new Error("Mapped odds row missing: "+card.set+" / "+parallel);
  const pool=poolSize(mapping);
  return {
    expected_copies_per_case:round(expectedFromOddsRow(row,pool)),
    pool_size:pool,
    odds_basis:
      ((row.type||"pack_odds")==="per_box"
        ? String(row.value)+" per box"
        : "1:"+String(row.denominator)+" per pack"),
    odds_source:
      card.category==="inserts" ? "insert-odds-map" : "autograph-odds-map"
  };
}

function anchorFor(card){
  const candidates=[];
  for(const subject of card.subjects||[]){
    const row=anchor.subjects?.[subject];
    const exact=row?.[card.category];
    if(Number(exact?.median_market_value_usd)>0){
      candidates.push({
        value:Number(exact.median_market_value_usd),
        subject,
        basis:"same-subject-same-category",
        observation_count:Number(exact.observation_count||0),
        confidence:
          Number(exact.observation_count||0)>=3 ? "high" : "medium"
      });
      continue;
    }
    const all=row?.all;
    if(Number(all?.median_market_value_usd)>0){
      candidates.push({
        value:Number(all.median_market_value_usd),
        subject,
        basis:"same-subject-cross-category",
        observation_count:Number(all.observation_count||0),
        confidence:"low"
      });
    }
  }

  if(candidates.length){
    candidates.sort((a,b)=>
      b.value-a.value ||
      b.observation_count-a.observation_count ||
      a.subject.localeCompare(b.subject)
    );
    return candidates[0];
  }

  const category=anchor.categories?.[card.category];
  if(
    category?.eligible_as_fallback===true &&
    Number(category.median_market_value_usd)>0
  ){
    return {
      value:Number(category.median_market_value_usd),
      subject:null,
      basis:"chelsea-category-median",
      observation_count:Number(category.observation_count||0),
      confidence:"low"
    };
  }

  if(!(Number(anchor.team?.median_market_value_usd)>0)){
    throw new Error("Chelsea team anchor missing");
  }
  return {
    value:Number(anchor.team.median_market_value_usd),
    subject:null,
    basis:"chelsea-team-median",
    observation_count:Number(anchor.team.observation_count||0),
    confidence:"low"
  };
}

const tasks=[];
for(const card of (inventory.cards||[]).filter(row=>row.team===team)){
  for(const parallel of card.canonical_variants||[]){
    const key=slotKey({
      category:card.category,
      team:card.team,
      set:card.set,
      card_number:card.card_number,
      parallel
    });
    if(valuedKeys.has(key)) continue;

    const odds=slotOdds(card,parallel);
    const marketAnchor=anchorFor(card);
    const proxy=round(
      odds.expected_copies_per_case*Number(marketAnchor.value)
    );

    const taskId=[
      product,
      "hobby",
      team,
      card.category,
      card.set,
      String(card.card_number),
      parallel
    ].join("::");
    const priorResearch=researchAttemptByTaskId.get(taskId)||null;

    tasks.push({
      rank:null,
      task_id:taskId,
      team,
      category:card.category,
      set:card.set,
      card_number:String(card.card_number),
      subjects:[...(card.subjects||[])],
      parallel,
      expected_copies_per_case:odds.expected_copies_per_case,
      odds_basis:odds.odds_basis,
      odds_pool_size:odds.pool_size,
      market_anchor:{
        median_market_value_usd:round(marketAnchor.value),
        basis:marketAnchor.basis,
        subject:marketAnchor.subject,
        observation_count:marketAnchor.observation_count,
        confidence:marketAnchor.confidence
      },
      economic_priority_proxy_usd:proxy,
      proxy_semantics:
        "expected_copies_per_case × transferred median market anchor; research ordering only, not predicted market value or EV",
      status:"unvalued",
      valuation_research:priorResearch ? {
        attempted:true,
        step:Number(priorResearch.step),
        outcome:priorResearch.outcome,
        blocker:priorResearch.blocker||null
      } : {
        attempted:false,
        step:null,
        outcome:null,
        blocker:null
      }
    });
  }
}

const basisOrder={
  "same-subject-same-category":0,
  "same-subject-cross-category":1,
  "chelsea-category-median":2,
  "chelsea-team-median":3
};

tasks.sort((a,b)=>
  Number(a.valuation_research?.attempted)-Number(b.valuation_research?.attempted) ||
  b.economic_priority_proxy_usd-a.economic_priority_proxy_usd ||
  (basisOrder[a.market_anchor.basis]??9)-
    (basisOrder[b.market_anchor.basis]??9) ||
  b.expected_copies_per_case-a.expected_copies_per_case ||
  a.category.localeCompare(b.category) ||
  a.set.localeCompare(b.set) ||
  a.card_number.localeCompare(b.card_number,undefined,{numeric:true}) ||
  a.parallel.localeCompare(b.parallel)
);
tasks.forEach((task,index)=>{task.rank=index+1;});

const countsByCategory={base_parallels:0,inserts:0,autographs:0};
const countsByAnchorBasis={};
for(const task of tasks){
  countsByCategory[task.category]=(countsByCategory[task.category]||0)+1;
  countsByAnchorBasis[task.market_anchor.basis]=
    (countsByAnchorBasis[task.market_anchor.basis]||0)+1;
}

const queue={
  schema_version:1,
  product_id:product,
  format_id:"hobby",
  team,
  generated_at:"2026-09-21",
  model:"chelsea-ev-completion-queue-v1",
  purpose:
    "Prioritize all remaining Chelsea EV-eligible contribution slots by a transparent economic-relevance research proxy, with untouched tasks ahead of previously blocked research.",
  source_files:{
    inventory:paths.inventory,
    provenance:paths.provenance,
    market_anchor:paths.anchor,
    valuation_research:paths.valuationResearch,
    base_odds:paths.baseOdds,
    insert_odds_mapping:paths.insertMap,
    autograph_odds_mapping:paths.autoMap,
    format:paths.format
  },
  rules:[
    "The queue contains every Chelsea eligible slot not already represented by committed EV contribution provenance.",
    "Expected copies per case are derived from the same published Hobby odds and checklist-pool semantics used by the player probability model.",
    "Economic priority proxy equals expected copies per case multiplied by a transferred median market anchor.",
    "The proxy is only a research-order heuristic. It is not a market value, expected value, ROI value or valuation substitute.",
    "Same-subject same-category anchors are preferred; cross-category and team/category fallbacks are explicitly lower-confidence.",
    "Actual EV can only be created after a slot receives its own market value and normal derivation provenance.",
    "Previously attempted tasks with no exact realized sales remain in the queue but sort behind untouched tasks.",
    "Queue order is deterministic and is regenerated whenever eligible inventory, committed EV contributions, valuation research, odds, format dimensions or anchor inputs change."
  ],
  summary:{
    eligible_chelsea_contribution_count:
      Number(inventory.teams?.Chelsea?.base_parallels?.eligible_contribution_count||0)+
      Number(inventory.teams?.Chelsea?.inserts?.eligible_contribution_count||0)+
      Number(inventory.teams?.Chelsea?.autographs?.eligible_contribution_count||0),
    already_valued_contribution_count:valuedKeys.size,
    remaining_task_count:tasks.length,
    category_remaining_task_count:countsByCategory,
    anchor_basis_task_count:countsByAnchorBasis
  },
  tasks
};

if(queue.summary.eligible_chelsea_contribution_count!==638){
  throw new Error("Chelsea eligible denominator changed");
}
if(
  queue.summary.already_valued_contribution_count+
  queue.summary.remaining_task_count!==
  queue.summary.eligible_chelsea_contribution_count
){
  throw new Error("Chelsea valued + remaining does not equal denominator");
}
for(const category of ["base_parallels","inserts","autographs"]){
  const eligible=Number(
    inventory.teams?.Chelsea?.[category]?.eligible_contribution_count||0
  );
  const expectedRemaining=eligible-Number(valuedByCategory[category]||0);
  if(Number(countsByCategory[category]||0)!==expectedRemaining){
    throw new Error(
      "Chelsea category remainder mismatch: "+category+
      " / "+countsByCategory[category]+" vs "+expectedRemaining
    );
  }
}

const content=stable(queue);
const target=path.join(root,paths.output);
if(check){
  const current=fs.existsSync(target) ? fs.readFileSync(target,"utf8") : "";
  if(current!==content){
    let firstDiff=0;
    const limit=Math.min(current.length,content.length);
    while(firstDiff<limit && current[firstDiff]===content[firstDiff]) firstDiff++;
    console.error(JSON.stringify({
      generated_file:paths.output,
      first_diff_index:firstDiff,
      current_length:current.length,
      expected_length:content.length,
      current_excerpt:current.slice(Math.max(0,firstDiff-160),firstDiff+320),
      expected_excerpt:content.slice(Math.max(0,firstDiff-160),firstDiff+320)
    },null,2));
    throw new Error("Generated file is stale: "+paths.output);
  }
}else{
  fs.writeFileSync(target,content);
}

console.log(JSON.stringify({
  result:check?"pass":"written",
  output:paths.output,
  remaining_task_count:tasks.length,
  category_remaining_task_count:countsByCategory,
  top_tasks:tasks.slice(0,10).map(task=>({
    rank:task.rank,
    task_id:task.task_id,
    expected_copies_per_case:task.expected_copies_per_case,
    anchor:task.market_anchor,
    economic_priority_proxy_usd:task.economic_priority_proxy_usd
  }))
},null,2));
