import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),"utf8"));
const failures=[];
const ok=(condition,message)=>{if(!condition) failures.push(message);};

const config=read("data/collection/continuous-market-collector-config-v1.json");
const method=read("data/methodology/automated-market-valuation-v1.json");
const store=read(config.observation_file);

ok(config.enabled===true,"collector must be enabled");
ok(Number(config.fast_lane?.cadence_minutes)>=15,"fast lane cadence must be at least 15 minutes");
ok(Number(config.fast_lane?.batch_size)>0,"batch size missing");
ok(Number(config.fast_lane?.min_request_interval_ms)>=1000,"provider rate limit guard must be at least 1000ms");
ok(config.fast_lane?.credential_env==="SPORTSCARDSPRO_TOKEN","unexpected API credential env");
ok(config.safety?.exact_identity_required===true,"exact identity must be required");
ok(config.safety?.allow_cross_series_match===false,"cross-series matching must remain disabled");
ok(config.safety?.auto_promote_modeled_values_to_canonical_ev===false,"modeled auto-promotion must remain disabled");
ok(Array.isArray(method.evidence_tiers)&&method.evidence_tiers.map(x=>x.tier).join("")==="ABCDE","valuation tiers A-E missing");
ok(method.evidence_tiers.find(x=>x.tier==="B")?.canonical_ev_eligible===false,"tier B must remain candidate-only");
ok(method.evidence_tiers.find(x=>x.tier==="C")?.canonical_ev_eligible===false,"tier C must remain model-only");
ok(method.evidence_tiers.find(x=>x.tier==="D")?.canonical_ev_eligible===false,"tier D must remain model-only");
ok(store.product_id===config.product_id,"observation store product mismatch");
ok(store.model==="market-observations-v1","observation store model mismatch");

console.log(JSON.stringify({
  result:failures.length?"fail":"pass",
  fast_lane_minutes:config.fast_lane?.cadence_minutes,
  batch_size:config.fast_lane?.batch_size,
  min_request_interval_ms:config.fast_lane?.min_request_interval_ms,
  valuation_tiers:method.evidence_tiers?.map(x=>x.tier),
  stored_observation_count:Object.keys(store.entries||{}).length,
  failures
},null,2));
if(failures.length) process.exit(1);
