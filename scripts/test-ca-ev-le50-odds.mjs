import fs from "node:fs";
import vm from "node:vm";
const data=JSON.parse(fs.readFileSync("data/derived/2026-topps-chrome-premier-league-ca-ev-le50-odds.json","utf8"));
const sandbox={};sandbox.globalThis=sandbox;vm.createContext(sandbox);vm.runInContext(fs.readFileSync("src/oddsEngine.js","utf8"),sandbox);
const O=sandbox.BreakMetricOdds;
const expected=[["gold-refractor",50,298],["gold-wave-refractor",50,319],["orange-refractor",25,564],["orange-wave-refractor",25,575],["black-refractor",10,1320],["black-wave-refractor",10,1350],["red-refractor",5,2570],["red-wave-refractor",5,2627],["superfractor",1,13548]];
if(data.product_id!=="2026-topps-chrome-premier-league"||data.format_id!=="hobby"||data.card_number!=="CA-EV")throw new Error("scope mismatch");
if(data.eligible_subjects!==128||data.opportunities_per_case!==240)throw new Error("population/case config mismatch");
if(data.variants.length!==9)throw new Error("expected nine Hobby CA-EV <=50 variants");
const ids=new Set();
for(const [slug,run,den] of expected){
 const v=data.variants.find(x=>x.variant_id.endsWith("::"+slug));if(!v)throw new Error("missing "+slug);
 if(ids.has(v.variant_id))throw new Error("duplicate variant_id");ids.add(v.variant_id);
 if(v.print_run!==run||v.official_category_denominator!==den||v.official_hobby_category_odds!=="1:"+den)throw new Error("source odds mismatch "+slug);
 const d=O.deriveSubjectOdds({category_denominator:den,eligible_subjects:128});const c=O.caseProbability({subject_denominator:d.subject_denominator,opportunities_per_case:240});
 if(v.derived_ca_ev_pack_denominator!==d.subject_denominator)throw new Error("derived pack odds mismatch "+slug);
 if(Math.abs(v.derived_probability_at_least_one_per_hobby_case-c.probability_at_least_one_in_case)>1e-15)throw new Error("case probability mismatch "+slug);
}
const gold=data.variants.find(v=>v.variant_id.endsWith("::gold-refractor")),wave=data.variants.find(v=>v.variant_id.endsWith("::gold-wave-refractor"));
if(gold.variant_id===wave.variant_id||gold.official_category_denominator===wave.official_category_denominator)throw new Error("Gold/Gold Wave collision");
console.log(JSON.stringify({result:"pass",variants:data.variants.length,gold_pack_odds:"1:"+gold.derived_ca_ev_pack_denominator,gold_case_probability:gold.derived_probability_at_least_one_per_hobby_case},null,2));
