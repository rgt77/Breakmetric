import fs from "node:fs";
import path from "node:path";
import {
  assessVerificationCandidate
} from "./lib/market-verification-candidate.mjs";

const root=process.cwd();
const candidateDir=path.join(
  root,
  "data/market/2026-topps-chrome-premier-league/candidates"
);
const queuePath=
  "data/market/2026-topps-chrome-premier-league/market-verification-queue-v1.json";

const failures=[];
const warnings=[];
const queue=JSON.parse(
  fs.readFileSync(path.join(root,queuePath),"utf8")
);
const catalog=JSON.parse(
  fs.readFileSync(path.join(root,"data/products/catalog.json"),"utf8")
);
const productEntry=(catalog.products||[])
  .find(item=>item.id===queue.product_id);
if(!productEntry?.product_data){
  console.error(JSON.stringify({
    result:"fail",
    failures:["queue product is not routed in product catalog"]
  },null,2));
  process.exit(1);
}
const product=JSON.parse(
  fs.readFileSync(path.join(root,productEntry.product_data),"utf8")
);

const files=fs.existsSync(candidateDir)
  ? fs.readdirSync(candidateDir)
      .filter(name=>name.endsWith(".json"))
      .sort()
  : [];

let historical=0;
let unresolved=0;
let mismatched=0;
let researchAttempted=0;
let researchUnavailable=0;
let researchHistoricalUnresolved=0;
const seenTaskIds=new Set();

for(const name of files){
  const rel=path.posix.join(
    "data/market/2026-topps-chrome-premier-league/candidates",
    name
  );
  const candidate=JSON.parse(
    fs.readFileSync(path.join(root,rel),"utf8")
  );
  const saleIndex=Number(candidate.sale_index);
  if(seenTaskIds.has(candidate.task_id)){
    failures.push(rel+" duplicates candidate task_id "+candidate.task_id);
  }
  seenTaskIds.add(candidate.task_id);
  const contribution=(queue.items||[]).find(item=>{
    const expected=[
      queue.product_id,
      queue.format_id,
      item.team,
      item.card_id,
      saleIndex
    ].join("::");
    return expected===candidate.task_id;
  });

  if(!contribution){
    failures.push(rel+" task_id does not resolve to verification queue");
    continue;
  }

  if(candidate.market_source_file!==contribution.market_source_file){
    failures.push(rel+" market_source_file does not match queue");
    continue;
  }

  const source=contribution.market_source_file;
  if(!source || !fs.existsSync(path.join(root,source))){
    failures.push(rel+" market source file missing");
    continue;
  }
  const record=JSON.parse(
    fs.readFileSync(path.join(root,source),"utf8")
  );
  const sale=record.sales?.[saleIndex];
  if(!sale){
    failures.push(rel+" sale_index does not resolve to market record");
    continue;
  }

  const task={
    task_id:candidate.task_id,
    contribution_priority_rank:Number(contribution.priority_rank),
    sale_index:saleIndex,
    product_id:queue.product_id,
    card_number:record.card_number,
    serial_numbering:
      record.serial_numbering===null ||
      record.serial_numbering===undefined
        ? null
        : Number(record.serial_numbering),
    team:contribution.team,
    card_id:contribution.card_id,
    player:contribution.player,
    set:contribution.set,
    parallel:contribution.parallel,
    ev_contribution_usd:Number(contribution.ev_contribution_usd||0),
    market_source_file:source,
    sale_date:sale.sale_date||null,
    sale_price_usd:Number(sale.sale_price),
    marketplace:sale.marketplace||null,
    serial_copy:sale.serial_copy||null
  };

  const assessment=assessVerificationCandidate({
    task,
    record,
    product,
    candidate
  });

  if(!assessment.valid){
    failures.push(
      rel+" invalid candidate: "+assessment.errors.join("; ")
    );
    continue;
  }

  if(candidate.assessment_status!==assessment.status){
    failures.push(
      rel+" stored assessment_status mismatch: "+
      candidate.assessment_status+" != "+assessment.status
    );
  }

  if(assessment.status==="historical-sale-match"){
    historical++;
  }else if(assessment.status==="identity-match-sale-unresolved"){
    unresolved++;
  }else if(assessment.status==="identity-mismatch"){
    mismatched++;
  }

  if(
    assessment.eligible_for_evidence &&
    (
      String(candidate.identity_source_kind||"").toLowerCase()!==
        "original-marketplace" ||
      String(candidate.observed_sale?.source_kind||"").toLowerCase()!==
        "original-marketplace"
    )
  ){
    failures.push(
      rel+" secondary-source candidate became evidence-eligible"
    );
  }

  if(
    candidate.original_marketplace_verified===true ||
    candidate.evidence_status==="original-marketplace-verified"
  ){
    failures.push(
      rel+" candidate file must not carry verified market-record state"
    );
  }

  if(Array.isArray(candidate.research_attempts)){
    for(const [attemptIndex,attempt] of candidate.research_attempts.entries()){
      const prefix=rel+" research_attempts["+attemptIndex+"]";
      if(
        typeof attempt.attempt_id!=="string" ||
        !attempt.attempt_id.trim()
      ){
        failures.push(prefix+" requires attempt_id");
      }
      if(
        typeof attempt.attempted_at!=="string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(attempt.attempted_at)
      ){
        failures.push(prefix+" requires YYYY-MM-DD attempted_at");
      }
      if(
        !Array.isArray(attempt.methods) ||
        attempt.methods.length===0 ||
        attempt.methods.some(method=>
          typeof method!=="string" || !method.trim()
        )
      ){
        failures.push(prefix+" requires non-empty methods");
      }
      if(![
        "original-source-unavailable",
        "historical-event-unresolved",
        "identity-mismatch",
        "historical-sale-match"
      ].includes(attempt.outcome)){
        failures.push(prefix+" has unsupported outcome");
      }
      if(attempt.evidence_found===true && attempt.outcome!=="historical-sale-match"){
        failures.push(prefix+" evidence_found requires historical-sale-match");
      }
    }
    if(candidate.research_attempts.length>0){
      researchAttempted++;
      const latest=candidate.research_attempts.at(-1);
      if(candidate.last_research_attempt_at!==latest.attempted_at){
        failures.push(rel+" last_research_attempt_at must match latest attempt");
      }
      const expectedResearchState="attempted-"+latest.outcome;
      if(candidate.research_state!==expectedResearchState){
        failures.push(
          rel+" research_state must match latest attempt outcome: "+
          expectedResearchState
        );
      }
      if(latest.outcome==="original-source-unavailable"){
        researchUnavailable++;
      }else if(latest.outcome==="historical-event-unresolved"){
        researchHistoricalUnresolved++;
      }
    }
  }

  if(!candidate.discovery_source?.url){
    warnings.push(rel+" has no discovery source URL");
  }
}

const expectedTaskIds=[];
for(const contribution of queue.items||[]){
  const source=contribution.market_source_file;
  if(!source || !fs.existsSync(path.join(root,source))){
    failures.push(
      "verification queue source missing while checking candidate coverage: "+
      (source||"<missing>")
    );
    continue;
  }
  const record=JSON.parse(
    fs.readFileSync(path.join(root,source),"utf8")
  );
  for(const [saleIndex] of (record.sales||[]).entries()){
    expectedTaskIds.push([
      queue.product_id,
      queue.format_id,
      contribution.team,
      contribution.card_id,
      saleIndex
    ].join("::"));
  }
}

for(const taskId of expectedTaskIds){
  if(!seenTaskIds.has(taskId)){
    failures.push("missing persisted candidate for frozen task "+taskId);
  }
}
for(const taskId of seenTaskIds){
  if(!expectedTaskIds.includes(taskId)){
    failures.push("persisted candidate is outside frozen queue "+taskId);
  }
}
if(files.length!==expectedTaskIds.length){
  failures.push(
    "candidate coverage count mismatch: "+
    files.length+" persisted vs "+expectedTaskIds.length+" frozen sales"
  );
}

console.log(JSON.stringify({
  result:failures.length?"fail":"pass",
  candidate_count:files.length,
  expected_frozen_sale_count:expectedTaskIds.length,
  unique_task_id_count:seenTaskIds.size,
  complete_frozen_scope:
    files.length===expectedTaskIds.length &&
    seenTaskIds.size===expectedTaskIds.length,
  historical_sale_match_count:historical,
  identity_match_sale_unresolved_count:unresolved,
  identity_mismatch_count:mismatched,
  research_attempted_candidate_count:researchAttempted,
  research_original_source_unavailable_count:researchUnavailable,
  research_historical_event_unresolved_count:researchHistoricalUnresolved,
  warning_count:warnings.length,
  failed_count:failures.length,
  failures,
  warnings
},null,2));

if(failures.length) process.exit(1);
