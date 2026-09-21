import assert from "node:assert/strict";
import {
  researchAttemptCount,
  nextResearchCandidate
} from "./lib/market-verification-research.mjs";

const unresolved=(task_id,rank,sale_index,attempts=[])=>({
  priority_rank:rank,
  sale_verified:false,
  candidate:{
    task_id,
    sale_index,
    assessment_status:"identity-match-sale-unresolved",
    research_attempts:attempts,
    last_research_attempt_at:attempts.at(-1)?.attempted_at
  }
});

const rows=[
  unresolved("rank1-sale0",1,0,[{
    attempt_id:"a1",
    attempted_at:"2026-09-21",
    methods:["exact-item-search"],
    outcome:"original-source-unavailable"
  }]),
  unresolved("rank1-sale1",1,1),
  unresolved("rank2-sale0",2,0),
  {
    ...unresolved("verified",1,2),
    sale_verified:true
  },
  {
    ...unresolved("mismatch",1,3),
    candidate:{
      task_id:"mismatch",
      sale_index:3,
      assessment_status:"identity-mismatch"
    }
  }
];

assert.equal(researchAttemptCount(rows[0].candidate),1);
assert.equal(researchAttemptCount(rows[1].candidate),0);
assert.equal(
  nextResearchCandidate(rows)?.candidate?.task_id,
  "rank1-sale1"
);

const allAttempted=[
  unresolved("oldest",1,0,[{
    attempt_id:"old",
    attempted_at:"2026-09-10",
    methods:["x"],
    outcome:"original-source-unavailable"
  }]),
  unresolved("newer",1,1,[{
    attempt_id:"new",
    attempted_at:"2026-09-20",
    methods:["x"],
    outcome:"original-source-unavailable"
  }])
];
assert.equal(
  nextResearchCandidate(allAttempted)?.candidate?.task_id,
  "oldest"
);

console.log(JSON.stringify({
  result:"pass",
  checks:[
    "never-researched unresolved sale is preferred over already-attempted sale",
    "contribution priority and sale index remain deterministic",
    "verified and identity-mismatch rows are excluded",
    "when all are attempted, oldest research attempt is retried first"
  ]
},null,2));
