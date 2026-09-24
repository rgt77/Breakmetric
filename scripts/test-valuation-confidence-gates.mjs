import assert from "node:assert/strict";
import fs from "node:fs";
import {
  estimateModeledValue,
  evaluateConfidenceGate
} from "./lib/valuation-model.mjs";

const policy=JSON.parse(
  fs.readFileSync(
    "data/methodology/valuation-confidence-gates-v1.json",
    "utf8"
  )
);
const baseline=JSON.parse(
  fs.readFileSync("data/validation/step-887.json","utf8")
).baseline;

const evidence=(count,{
  team="Chelsea",
  category="base_parallels",
  subject="Player A"
}={})=>Array.from({length:count},(_,index)=>({
  evidence_class:"canonical-realized-sale",
  team,
  category,
  subject,
  value:10+index
}));

const task={
  team:"Chelsea",
  category:"base_parallels",
  subjects:["Player A"]
};

const raw=estimateModeledValue(task,evidence(3));
assert.equal(raw.tier,"C");

const blockedGate=evaluateConfidenceGate(raw,policy,baseline);
assert.equal(blockedGate.passed,false);
assert.ok(
  blockedGate.reasons.includes("insufficient-team-diversity")
);
assert.ok(
  blockedGate.reasons.includes(
    "median-absolute-percentage-error-too-high"
  )
);

const blocked=estimateModeledValue(
  task,
  evidence(3),
  {gatePolicy:policy,calibration:baseline}
);
assert.equal(blocked.tier,"E");
assert.equal(blocked.basis,"confidence-gate-failed");
assert.equal(blocked.value,null);
assert.equal(blocked.proposed_tier,"C");
assert.equal(blocked.confidence_gate.status,"failed");

const goodCalibration={
  canonical_holdout_count:60,
  prediction_coverage_pct:90,
  median_absolute_percentage_error_pct:20,
  population:{team_count:5}
};
const allowed=estimateModeledValue(
  task,
  evidence(3),
  {gatePolicy:policy,calibration:goodCalibration}
);
assert.equal(allowed.tier,"C");
assert.equal(allowed.value,11);
assert.equal(allowed.confidence_gate.status,"passed");

const thin=estimateModeledValue(
  task,
  evidence(2),
  {gatePolicy:policy,calibration:goodCalibration}
);
assert.equal(thin.tier,"E");
assert.equal(thin.proposed_tier,"C");
assert.ok(
  thin.confidence_gate.reasons.includes(
    "insufficient-local-evidence"
  )
);

const teamDEvidence=[
  ...evidence(8,{subject:"A"}),
  ...evidence(0)
].map((row,index)=>({
  ...row,
  subject:"Subject "+index
}));
const teamD=estimateModeledValue(
  {
    team:"Chelsea",
    category:"base_parallels",
    subjects:["Absent"]
  },
  teamDEvidence,
  {gatePolicy:policy,calibration:goodCalibration}
);
assert.equal(teamD.tier,"D");
assert.equal(teamD.basis,"team-category-model");
assert.equal(teamD.confidence_gate.status,"passed");

const productEvidence=[];
for(let team=0;team<4;team++){
  for(let i=0;i<5;i++){
    productEvidence.push({
      evidence_class:"canonical-realized-sale",
      team:"Team "+team,
      category:"inserts",
      subject:"Subject "+team+"-"+i,
      value:5+team+i
    });
  }
}
const productD=estimateModeledValue(
  {
    team:"No Evidence Team",
    category:"inserts",
    subjects:["Absent"]
  },
  productEvidence,
  {gatePolicy:policy,calibration:goodCalibration}
);
assert.equal(productD.tier,"D");
assert.equal(productD.basis,"product-category-model");
assert.equal(productD.confidence_gate.status,"passed");

const lowDiversity=productEvidence.map(row=>({
  ...row,
  team:"One Team"
}));
const productBlocked=estimateModeledValue(
  {
    team:"No Evidence Team",
    category:"inserts",
    subjects:["Absent"]
  },
  lowDiversity,
  {gatePolicy:policy,calibration:goodCalibration}
);
assert.equal(productBlocked.tier,"E");
assert.ok(
  productBlocked.confidence_gate.reasons.includes(
    "insufficient-local-team-diversity"
  )
);

console.log(JSON.stringify({
  result:"pass",
  checks:22,
  current_baseline_gate_status:blockedGate.status,
  current_baseline_reasons:blockedGate.reasons
},null,2));
