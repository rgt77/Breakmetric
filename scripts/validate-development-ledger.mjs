import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const failures=[];
const checks=[];
const pass=(name,condition,detail="")=>{
  checks.push({name,pass:Boolean(condition),detail});
  if(!condition) failures.push(detail ? name+": "+detail : name);
};
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const json=p=>JSON.parse(read(p));
const exists=p=>fs.existsSync(path.join(root,p));

const ledger=json("data/validation/development-ledger-v1.json");
const phases=Array.isArray(ledger.phases) ? ledger.phases : [];

pass(
  "development ledger schema",
  ledger.schema_version===1 &&
  ledger.model==="development-ledger-v1"
);
pass(
  "development ledger has phases",
  phases.length>0
);

const ids=new Set();
let expected=Number(ledger.canonical_step_start);
let covered=0;

for(const [index,phase] of phases.entries()){
  const start=Number(phase.start);
  const end=Number(phase.end);
  pass(
    "phase "+index+" has valid range",
    Number.isInteger(start) &&
    Number.isInteger(end) &&
    start>0 &&
    end>=start
  );
  pass(
    "phase "+phase.id+" starts contiguously",
    start===expected,
    "expected "+expected+", got "+start
  );
  pass(
    "phase "+phase.id+" id is unique",
    typeof phase.id==="string" &&
    phase.id.length>0 &&
    !ids.has(phase.id)
  );
  ids.add(phase.id);
  covered+=end-start+1;
  expected=end+1;

  if(
    typeof phase.source==="string" &&
    (phase.source.startsWith("data/") || phase.source.startsWith("docs/"))
  ){
    pass(
      "phase "+phase.id+" source exists",
      exists(phase.source),
      phase.source
    );
  }
}

pass(
  "development ledger ends at declared current step",
  expected-1===Number(ledger.canonical_step_end)
);
pass(
  "development ledger covers every canonical step once",
  covered===
    Number(ledger.canonical_step_end)-
    Number(ledger.canonical_step_start)+1
);

const v10=json("data/validation/v10-player-derivation-reproducibility-v1.json");
const v11=json("data/validation/v11-analysis-provenance-v1.json");
const canonicalV11=phases.find(phase=>phase.id==="v1.1-analysis-provenance");
const overlapAnomaly=(ledger.historical_anomalies||[]).find(
  item=>item.id==="v1.0-v1.1-step-overlap"
);

pass(
  "historical v1.0 and v1.1 overlap is detected rather than hidden",
  v10.block==="steps 356-365" &&
  v11.block==="steps 356-365" &&
  Boolean(overlapAnomaly)
);
pass(
  "canonical ledger resolves v1.1 chronology without rewriting history",
  canonicalV11?.start===366 &&
  canonicalV11?.end===375 &&
  canonicalV11?.historical_range?.start===356 &&
  canonicalV11?.historical_range?.end===365
);

const exactManifestRanges=[
  ["v0.3-ui-integrity","data/validation/ui-integrity-v03.json",170,174],
  ["v0.4-analysis-scope","data/validation/v04-analysis-unit-data-status-v1.json",188,207],
  ["v0.5-market-evidence","data/validation/v05-market-evidence-integrity-v1.json",208,227],
  ["v0.6-runtime-contracts","data/validation/v06-runtime-contracts-state-safety-v1.json",236,285],
  ["v0.7-market-registry","data/validation/v07-team-market-evidence-registry-v1.json",286,305],
  ["v0.8-team-readiness","data/validation/v08-team-analysis-readiness-v1.json",306,325],
  ["v0.9-release-contracts","data/validation/v09-release-format-contracts-v1.json",326,355],
  ["v1.0-player-reproducibility","data/validation/v10-player-derivation-reproducibility-v1.json",356,365],
  ["v1.2-n100","data/validation/v12-n100.json",397,496],
  ["v1.3-n200","data/validation/v13-n200.json",498,697]
];

for(const [id,file,start,end] of exactManifestRanges){
  const phase=phases.find(row=>row.id===id);
  pass(
    "exact manifest phase "+id+" is canonical",
    phase?.start===start && phase?.end===end
  );
  pass(
    "exact manifest source "+id+" exists",
    exists(file),
    file
  );
}

const firstPassPhase=phases.find(
  phase=>phase.id==="research-first-pass-complete"
);
const firstPass=json("data/validation/steps-777-825.json");
pass(
  "completed first market research pass remains in canonical history",
  firstPassPhase?.start===777 &&
  firstPassPhase?.end===825 &&
  firstPass.step_range?.start===777 &&
  firstPass.step_range?.end===825 &&
  firstPass.original_unresolved_pool?.first_pass_complete===true
);

const audit=json("data/validation/architecture-review-steps-1-825.json");
pass(
  "steps 1-825 architecture audit remains an immutable reviewed snapshot",
  audit.schema_version===1 &&
  audit.reviewed_step_range?.start===1 &&
  audit.reviewed_step_range?.end===825 &&
  Number(ledger.canonical_step_end)>=825 &&
  audit.result==="pass-with-structural-actions"
);

const policy=json("data/methodology/validation-architecture-v1.json");
pass(
  "snapshot-safe validation policy exists",
  policy.schema_version===1 &&
  policy.principles?.some(value=>
    value.includes("immutable snapshots")
  ) &&
  policy.principles?.some(value=>
    value.includes("derive aggregate counts")
  )
);

pass(
  "architecture review documents canonical ledger",
  exists("docs/architecture-review-steps-1-825.md") &&
  read("docs/architecture-review-steps-1-825.md").includes(
    "Canonical development chronology"
  )
);

console.log(JSON.stringify({
  result:failures.length?"fail":"pass",
  canonical_step_start:ledger.canonical_step_start,
  canonical_step_end:ledger.canonical_step_end,
  phase_count:phases.length,
  covered_step_count:covered,
  check_count:checks.length,
  failed_count:failures.length,
  failures
},null,2));

if(failures.length) process.exit(1);
