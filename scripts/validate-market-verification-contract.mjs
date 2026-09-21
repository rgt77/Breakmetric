import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const queuePath="data/market/2026-topps-chrome-premier-league/market-verification-queue-v1.json";
const queue=JSON.parse(fs.readFileSync(path.join(root,queuePath),"utf8"));
const failures=[];
const taskIds=new Set();
const ranks=new Set();

let supportingSaleCount=0;
let pendingSaleCount=0;
let verifiedContributionCount=0;
let pendingContributionCount=0;
let totalEv=0;
let pendingEv=0;

const isHttpUrl=value=>
  typeof value==="string" &&
  /^https?:\/\//i.test(value);

for(const item of queue.items||[]){
  const prefix=`priority ${item.priority_rank} ${item.card_id}`;
  const taskId=[
    queue.product_id,
    queue.format_id,
    item.team,
    item.card_id
  ].join("::");

  if(taskIds.has(taskId)) failures.push(prefix+" duplicate task id");
  taskIds.add(taskId);

  if(ranks.has(item.priority_rank)) failures.push(prefix+" duplicate priority rank");
  ranks.add(item.priority_rank);

  if(!fs.existsSync(path.join(root,item.market_source_file||""))){
    failures.push(prefix+" market source file missing");
    continue;
  }

  const record=JSON.parse(
    fs.readFileSync(path.join(root,item.market_source_file),"utf8")
  );
  if(record.schema_version!==2){
    failures.push(prefix+" market record schema must be v2");
    continue;
  }

  if(record.team!==item.team) failures.push(prefix+" team mismatch");
  if(record.player!==item.player) failures.push(prefix+" player mismatch");
  if(record.set!==item.set) failures.push(prefix+" set mismatch");
  if(record.parallel!==item.parallel) failures.push(prefix+" parallel mismatch");

  const sales=Array.isArray(record.sales)?record.sales:[];
  if(!sales.length) failures.push(prefix+" has no supporting realized-sale sample");

  let verifiedSales=0;
  for(const [index,sale] of sales.entries()){
    const salePrefix=prefix+" sale "+index;
    supportingSaleCount++;

    const original=sale.original_marketplace_verified===true;
    const directUrl=
      sale.direct_marketplace_url ||
      sale.original_marketplace_url ||
      null;
    const stableSaleId=
      sale.source_sale_id ||
      sale.marketplace_sale_id ||
      sale.listing_id ||
      null;
    const recovered=sale.direct_marketplace_url_recovered===true;
    const hasOriginalLocator=isHttpUrl(directUrl) ||
      (typeof stableSaleId==="string" && stableSaleId.trim().length>0);

    if(original){
      verifiedSales++;
      if(sale.evidence_status!=="original-marketplace-verified"){
        failures.push(salePrefix+" verified sale has wrong evidence status");
      }
      if(!recovered && !hasOriginalLocator){
        failures.push(salePrefix+" verified sale lacks recoverable original locator");
      }
      if(!hasOriginalLocator){
        failures.push(salePrefix+" verified sale lacks direct URL or stable sale id");
      }
    }else{
      pendingSaleCount++;
      if(sale.evidence_status==="original-marketplace-verified"){
        failures.push(salePrefix+" original evidence status without verification flag");
      }
    }

    if(sale.evidence_status==="secondary-source-realized-sale"){
      if(
        !sale.discovery_source ||
        !sale.marketplace ||
        !sale.source_reference
      ){
        failures.push(salePrefix+" incomplete secondary-source evidence");
      }
      if(original){
        failures.push(salePrefix+" secondary-source sale cannot be original verified");
      }
    }
  }

  const contributionVerified=
    sales.length>0 &&
    verifiedSales===sales.length;

  if(contributionVerified) verifiedContributionCount++;
  else pendingContributionCount++;

  if(item.original_marketplace_verified!==contributionVerified){
    failures.push(
      prefix+
      " queue verification flag does not equal all-supporting-sales verification state"
    );
  }

  const expectedQueueStatus=contributionVerified
    ? "verified-original-marketplace"
    : "pending-original-verification";
  if(item.verification_status!==expectedQueueStatus){
    failures.push(
      prefix+
      " queue verification status mismatch: expected "+
      expectedQueueStatus
    );
  }

  const ev=Number(item.ev_contribution_usd);
  if(!Number.isFinite(ev) || ev<0){
    failures.push(prefix+" invalid EV contribution");
  }else{
    totalEv+=ev;
    if(!contributionVerified) pendingEv+=ev;
  }
}

const items=queue.items||[];
const expectedRanks=Array.from(
  {length:items.length},
  (_,index)=>index+1
);
const actualRanks=[...ranks].sort((a,b)=>a-b);
if(JSON.stringify(actualRanks)!==JSON.stringify(expectedRanks)){
  failures.push("verification priority ranks are not contiguous from 1");
}

const summary=queue.summary||{};
if(Number(summary.contribution_count)!==items.length){
  failures.push("queue contribution_count mismatch");
}
if(Number(summary.original_verified_count)!==verifiedContributionCount){
  failures.push("queue original_verified_count mismatch");
}
if(
  Number(summary.pending_original_verification_count)!==
  pendingContributionCount
){
  failures.push("queue pending_original_verification_count mismatch");
}

console.log(JSON.stringify({
  result:failures.length?"fail":"pass",
  contribution_count:items.length,
  supporting_sale_count:supportingSaleCount,
  verified_original_sale_count:supportingSaleCount-pendingSaleCount,
  pending_original_sale_count:pendingSaleCount,
  original_verified_contribution_count:verifiedContributionCount,
  pending_contribution_count:pendingContributionCount,
  total_ev_usd:Number(totalEv.toFixed(4)),
  pending_verification_ev_usd:Number(pendingEv.toFixed(4)),
  failed_count:failures.length,
  failures
},null,2));

if(failures.length) process.exit(1);
