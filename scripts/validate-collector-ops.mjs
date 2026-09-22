import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),"utf8"));
const failures=[];
const ok=(condition,message)=>{if(!condition) failures.push(message);};

const config=read("data/collection/continuous-market-collector-config-v1.json");
const t=config.telemetry||{};
const requiredFiles=[
  t.state_file,t.runs_file,t.metrics_file,t.coverage_file,
  t.exceptions_file,t.price_history_file,t.quarantine_file,
  t.soak_file,t.acceptance_file
];
for(const file of requiredFiles){
  ok(typeof file==="string"&&fs.existsSync(path.join(root,file)),"missing collector ops file: "+file);
}
const state=read(t.state_file);
const runs=read(t.runs_file);
const metrics=read(t.metrics_file);
const coverage=read(t.coverage_file);
const exceptions=read(t.exceptions_file);
const priceHistory=read(t.price_history_file);
const quarantine=read(t.quarantine_file);
const soak=read(t.soak_file);
const acceptance=read(t.acceptance_file);
const baseline=read("data/validation/phase1-collector-baseline-v1.json");
const provenance=read(config.task_sources.provenance);

ok(state.model==="collector-state-v1","state model mismatch");
ok(runs.model==="collector-runs-v1","runs model mismatch");
ok(metrics.model==="collector-metrics-v1","metrics model mismatch");
ok(coverage.model==="collector-coverage-v1","coverage model mismatch");
ok(exceptions.model==="collector-exceptions-v1","exceptions model mismatch");
ok(priceHistory.model==="collector-price-history-v1","price history model mismatch");
ok(quarantine.model==="collector-quarantine-v1","quarantine model mismatch");
ok(soak.model==="collector-soak-v1","soak model mismatch");
ok(acceptance.model==="continuous-market-collection-v1-acceptance","acceptance model mismatch");
ok(baseline.facts?.fast_lane_live===false,"baseline must record fast lane as non-live");
ok(baseline.facts?.bulk_lane_live===false,"baseline must record bulk lane as non-live");
ok(state.licensing?.public_repository===true,"collector state must record public repository context");
ok(state.licensing?.public_sharing_required===true,"collector state must require public sharing approval");
ok(state.licensing?.public_sharing_approved===false,"baseline must remain blocked pending commercial sharing approval");
ok(acceptance.checks?.commercial_sharing_approved===false,"baseline acceptance must include commercial sharing blocker");
ok(Number(coverage.eligible_slot_count)===8896,"coverage denominator mismatch");
ok(
  Number(coverage.canonical_valued_slot_count)===
  Number(provenance.summary?.contribution_count||0),
  "coverage canonical valued count does not match current provenance"
);
ok(Number(config.retry?.max_attempts)>=2,"retry policy missing");
ok(Number(config.telemetry?.run_history_limit)>=96,"run retention too short for 24h evidence");
ok(Number(config.acceptance?.soak_hours)===24,"soak duration must be 24 hours");
ok(config.fast_lane?.fairness_mode==="team-then-subject-round-robin","fairness mode mismatch");
ok(config.fast_lane?.persist_cursor===true,"persistent cursor must be enabled");
ok(config.safety?.auto_promote_modeled_values_to_canonical_ev===false,"canonical EV safety changed");

const serialized=requiredFiles.map(file=>fs.readFileSync(path.join(root,file),"utf8")).join("\n");
ok(!/SPORTSCARDSPRO_TOKEN\s*[:=]\s*[^"\n]*[A-Za-z0-9]{8}/.test(serialized),"collector ops appear to contain an API token");
ok(!/https?:\/\/[^"\n]*download[^"\n]*token=/i.test(serialized),"collector ops appear to contain a private CSV URL");

console.log(JSON.stringify({
  result:failures.length?"fail":"pass",
  operational_health:state.health,
  soak_status:soak.status,
  acceptance_status:acceptance.status,
  retained_runs:(runs.entries||[]).length,
  failures
},null,2));
if(failures.length) process.exit(1);
