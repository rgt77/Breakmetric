import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const readJson=file=>JSON.parse(fs.readFileSync(path.join(root,file),"utf8"));
const inventory=readJson("data/derived/2026-topps-chrome-premier-league-hobby-ev-eligible-inventory-v1.json");
const provenance=readJson("data/derived/2026-topps-chrome-premier-league-hobby-ev-contribution-provenance-v1.json");

const failures=[];
const slotKeys=new Set();
let expanded=0;

for(const card of inventory.cards||[]){
  if(!card.team) failures.push("eligible card missing team: "+card.set+" / "+card.card_number);
  if(!Array.isArray(card.canonical_variants) || !card.canonical_variants.length){
    failures.push("eligible card has no variants: "+card.set+" / "+card.card_number);
    continue;
  }
  if(Number(card.eligible_contribution_count)!==card.canonical_variants.length){
    failures.push("eligible contribution count mismatch: "+card.set+" / "+card.card_number);
  }
  for(const variant of card.canonical_variants){
    const key=[card.category,card.team,card.set,card.card_number,variant].join("|");
    if(slotKeys.has(key)) failures.push("duplicate eligible slot: "+key);
    slotKeys.add(key);
    expanded++;
  }
}

if(expanded!==Number(inventory.summary?.eligible_contribution_count)){
  failures.push("expanded eligible slot count does not match summary");
}

for(const row of inventory.excluded||[]){
  if(row.reason==="multi-team" && (row.teams||[]).length<=1){
    failures.push("multi-team exclusion lacks multiple teams: "+row.set+" / "+row.card_number);
  }
  if(row.reason==="team-unresolved" && (row.teams||[]).length!==0){
    failures.push("team-unresolved exclusion unexpectedly has team: "+row.set+" / "+row.card_number);
  }
}

const contributionMatches=[];
for(const entry of provenance.entries||[]){
  const matches=(inventory.cards||[]).filter(card=>
    card.team===entry.team &&
    card.set===entry.set &&
    card.canonical_variants?.includes(entry.parallel) &&
    (!entry.player || card.subjects?.includes(entry.player))
  );
  contributionMatches.push({
    card_id:entry.card_id,
    team:entry.team,
    set:entry.set,
    parallel:entry.parallel,
    match_count:matches.length
  });
  if(matches.length!==1){
    failures.push(
      "EV contribution must resolve to exactly one eligible slot: "+
      entry.card_id+" -> "+matches.length
    );
  }
}

const chelsea=inventory.teams?.Chelsea||{};
if(Number(chelsea.base_parallels?.eligible_contribution_count)!==250){
  failures.push("Chelsea base denominator mismatch");
}
if(Number(chelsea.inserts?.eligible_contribution_count)!==125){
  failures.push("Chelsea insert denominator mismatch");
}
if(Number(chelsea.autographs?.eligible_contribution_count)!==263){
  failures.push("Chelsea autograph denominator mismatch");
}

console.log(JSON.stringify({
  result:failures.length?"fail":"pass",
  eligible_card_count:(inventory.cards||[]).length,
  eligible_contribution_count:expanded,
  excluded_card_count:(inventory.excluded||[]).length,
  provenance_contribution_count:(provenance.entries||[]).length,
  uniquely_resolved_contribution_count:
    contributionMatches.filter(row=>row.match_count===1).length,
  failures
},null,2));

if(failures.length) process.exit(1);
