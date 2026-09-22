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
ok(config.scope?.mode==="full-release-unvalued-slots","collector scope must cover full release");
ok(Number(config.scope?.eligible_slot_denominator)===8896,"collector denominator must remain 8896");
for(const [name,file] of Object.entries(config.task_sources||{})){
  ok(typeof file==="string"&&fs.existsSync(path.join(root,file)),"missing task source: "+name);
}
ok(Number(config.fast_lane?.cadence_minutes)>=15,"fast lane cadence must be at least 15 minutes");
ok(Number(config.fast_lane?.batch_size)>0,"batch size missing");
ok(Number(config.fast_lane?.min_request_interval_ms)>=1000,"provider rate limit guard must be at least 1000ms");
ok(config.fast_lane?.credential_env==="SPORTSCARDSPRO_TOKEN","unexpected API credential env");
ok(config.fast_lane?.persist_cursor===true,"fast lane cursor persistence disabled");
ok(
  config.fast_lane?.fairness_mode==="team-then-subject-round-robin",
  "fast lane fairness mode mismatch"
);
ok(Number(config.fast_lane?.max_tasks_per_team_per_batch)>=1,"team fairness cap missing");
ok(config.bulk_lane?.optional===true,"bulk lane optional flag missing");
ok(config.licensing?.provider==="SportsCardsPro","provider licensing metadata missing");
ok(config.licensing?.repository_visibility==="public","repository visibility licensing context mismatch");
ok(config.licensing?.public_sharing_requires_approval===true,"public sharing approval gate disabled");
ok(
  config.licensing?.approval_env==="SPORTSCARDSPRO_COMMERCIAL_SHARING_APPROVED",
  "unexpected commercial sharing approval env"
);
ok(config.acceptance?.require_public_sharing_approval===true,"acceptance must require commercial sharing approval");
ok(Number(config.retry?.max_attempts)>=2,"retry attempts missing");
ok(Number(config.retry?.base_delay_ms)>=1,"retry base delay missing");
ok(Number(config.retry?.max_delay_ms)>=Number(config.retry?.base_delay_ms||0),"retry max delay invalid");
ok(Array.isArray(config.retry?.retry_http_statuses)&&config.retry.retry_http_statuses.includes(429),"429 retry policy missing");
ok(Number(config.quality?.max_price_change_ratio)>1,"price-change quality threshold missing");
ok(Number(config.telemetry?.run_history_limit)>=96,"collector run retention too short");
ok(Number(config.telemetry?.stale_fast_lane_minutes)>0,"fast-lane stale threshold missing");
ok(Number(config.acceptance?.soak_hours)===24,"collector soak must be 24 hours");
ok(Number(config.acceptance?.min_successful_live_fast_runs)>0,"minimum live-run acceptance threshold missing");
for(const [name,file] of Object.entries({
  state:config.telemetry?.state_file,
  runs:config.telemetry?.runs_file,
  metrics:config.telemetry?.metrics_file,
  coverage:config.telemetry?.coverage_file,
  exceptions:config.telemetry?.exceptions_file,
  price_history:config.telemetry?.price_history_file,
  quarantine:config.telemetry?.quarantine_file,
  soak:config.telemetry?.soak_file,
  acceptance:config.telemetry?.acceptance_file
})){
  ok(
    typeof file==="string"&&file.startsWith("ops/collector/"),
    "collector operational file must stay outside runtime data: "+name
  );
  ok(
    typeof file==="string"&&fs.existsSync(path.join(root,file)),
    "collector operational file missing: "+name
  );
}
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
