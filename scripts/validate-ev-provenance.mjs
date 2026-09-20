import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const product="2026-topps-chrome-premier-league";
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));
const ev=read("data/derived/"+product+"-team-ev-progress.json");
const provenance=read("data/derived/"+product+"-hobby-ev-contribution-provenance-v1.json");
const failures=[];
let checked=0;

for(const entry of provenance.entries||[]){
  checked++;
  if(!entry.derived_ev_file || !fs.existsSync(path.join(root,entry.derived_ev_file))){
    failures.push("missing derivation file: "+entry.card_id);
    continue;
  }
  if(!entry.market_source_file || !fs.existsSync(path.join(root,entry.market_source_file))){
    failures.push("missing market source file: "+entry.card_id);
  }
  const derived=read(entry.derived_ev_file);
  const evRow=ev.teams?.[entry.team]?.contributions?.find(x=>x.card_id===entry.card_id);
  if(!evRow){
    failures.push("provenance entry missing committed EV row: "+entry.card_id);
    continue;
  }
  for(const key of ["team","player","set","parallel"]){
    if(String(derived[key]??"")!==String(entry[key]??"")){
      failures.push("derivation "+key+" mismatch: "+entry.card_id);
    }
  }
  const expected=Number(derived.calculation?.expected_copies_per_case);
  const probability=Number(derived.calculation?.probability_at_least_one_in_case);
  const market=Number(derived.market_value_usd);
  const derivedEv=Number(derived.calculation?.ev_contribution_usd);
  if(!Number.isFinite(expected) || expected<0) failures.push("invalid expected copies: "+entry.card_id);
  if(!Number.isFinite(probability) || probability<0 || probability>1) failures.push("invalid at-least-one probability: "+entry.card_id);
  if(!Number.isFinite(market) || market<0) failures.push("invalid market value: "+entry.card_id);
  if(!Number.isFinite(derivedEv) || derivedEv<0) failures.push("invalid derived EV: "+entry.card_id);
  if(Number.isFinite(expected)&&Number.isFinite(market)&&Math.abs(expected*market-derivedEv)>0.001){
    failures.push("EV formula mismatch: "+entry.card_id);
  }
  if(Math.abs(derivedEv-Number(evRow.ev_contribution_usd))>0.02){
    failures.push("derived EV differs from committed contribution: "+entry.card_id);
  }
}

const committedCount=Object.values(ev.teams||{}).reduce((sum,row)=>sum+(row.contributions||[]).length,0);
if(checked!==committedCount) failures.push("provenance / committed EV contribution count mismatch");
if(Number(provenance.summary?.derivation_linked_count)!==checked) failures.push("provenance linked summary mismatch");

console.log(JSON.stringify({result:failures.length?"fail":"pass",checked_contributions:checked,failed_count:failures.length,failures},null,2));
if(failures.length) process.exit(1);
