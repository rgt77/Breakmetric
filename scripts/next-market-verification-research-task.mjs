import fs from "node:fs";
import path from "node:path";
import {
  nextResearchCandidate,
  researchAttemptCount
} from "./lib/market-verification-research.mjs";

const root=process.cwd();
const queuePath=
  "data/market/2026-topps-chrome-premier-league/market-verification-queue-v1.json";
const candidateDir=
  "data/market/2026-topps-chrome-premier-league/candidates";

const queue=JSON.parse(
  fs.readFileSync(path.join(root,queuePath),"utf8")
);
const rows=[];

for(const name of fs.readdirSync(path.join(root,candidateDir))
  .filter(name=>name.endsWith(".json"))
  .sort()){
  const rel=path.posix.join(candidateDir,name);
  const candidate=JSON.parse(
    fs.readFileSync(path.join(root,rel),"utf8")
  );
  const contribution=(queue.items||[]).find(item=>
    candidate.task_id.startsWith([
      queue.product_id,
      queue.format_id,
      item.team,
      item.card_id
    ].join("::")+"::")
  );
  if(!contribution) continue;

  const record=JSON.parse(
    fs.readFileSync(
      path.join(root,contribution.market_source_file),
      "utf8"
    )
  );
  const sale=record.sales?.[Number(candidate.sale_index)];
  rows.push({
    priority_rank:Number(contribution.priority_rank),
    sale_verified:
      sale?.original_marketplace_verified===true &&
      sale?.evidence_status==="original-marketplace-verified",
    candidate,
    candidate_file:rel
  });
}

const next=nextResearchCandidate(rows);
if(!next){
  console.log(JSON.stringify({
    result:"complete",
    reason:"no unresolved research candidate remains"
  },null,2));
  process.exit(0);
}

console.log(JSON.stringify({
  result:"pass",
  task_id:next.candidate.task_id,
  priority_rank:next.priority_rank,
  sale_index:Number(next.candidate.sale_index),
  candidate_file:next.candidate_file,
  source_sale_id:next.candidate.source_sale_id||null,
  direct_marketplace_url:next.candidate.direct_marketplace_url||null,
  prior_research_attempt_count:researchAttemptCount(next.candidate),
  research_state:next.candidate.research_state||"not-yet-researched"
},null,2));
