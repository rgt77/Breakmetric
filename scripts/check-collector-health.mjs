import fs from "node:fs";
import path from "node:path";
import {
  evaluateSoakAndAcceptance,
  loadCollectorOps,
  persistCollectorOps,
  recomputeHealth
} from "./lib/collector-telemetry.mjs";

const root=process.cwd();
const args=process.argv.slice(2);
const strict=args.includes("--strict");
const write=args.includes("--write");
const config=JSON.parse(fs.readFileSync(
  path.join(root,"data/collection/continuous-market-collector-config-v1.json"),
  "utf8"
));
const provenance=JSON.parse(fs.readFileSync(
  path.join(root,config.task_sources.provenance),
  "utf8"
));
const ops=loadCollectorOps(root,config);
const now=new Date().toISOString();
const health=recomputeHealth(ops,config,now);
evaluateSoakAndAcceptance(
  ops,config,now,Number(provenance.summary?.contribution_count||0)
);
if(write) persistCollectorOps(root,config,ops);

console.log(JSON.stringify({
  result:strict&&health.status==="stalled"?"fail":"pass",
  health,
  soak:ops.soak,
  acceptance:ops.acceptance
},null,2));

if(strict&&health.status==="stalled"&&ops.state.lane_status?.fast?.credential_present===true){
  process.exit(1);
}
