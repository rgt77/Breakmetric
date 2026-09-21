import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const readJson=p=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));
const stable=value=>JSON.stringify(value,null,2)+"\n";
const writeOrCheck=(target,value,check)=>{
  const content=stable(value);
  const full=path.join(root,target);
  if(check){
    if(!fs.existsSync(full) || fs.readFileSync(full,"utf8")!==content){
      throw new Error("Generated file is stale: "+target);
    }
  }else{
    fs.writeFileSync(full,content);
  }
};

const product="2026-topps-chrome-premier-league";

const hasOriginalLocator=sale=>{
  const directUrl=
    sale?.direct_marketplace_url ||
    sale?.original_marketplace_url ||
    null;
  const stableSaleId=
    sale?.source_sale_id ||
    sale?.marketplace_sale_id ||
    sale?.listing_id ||
    null;
  return (
    typeof directUrl==="string" &&
    /^https?:\/\//i.test(directUrl)
  ) || (
    typeof stableSaleId==="string" &&
    stableSaleId.trim().length>0
  );
};

const contributionOriginalVerified=marketSourceFile=>{
  if(
    typeof marketSourceFile!=="string" ||
    !marketSourceFile ||
    !fs.existsSync(path.join(root,marketSourceFile))
  ){
    return false;
  }
  const record=readJson(marketSourceFile);
  const sales=Array.isArray(record.sales)?record.sales:[];
  return sales.length>0 && sales.every(sale=>
    sale.original_marketplace_verified===true &&
    sale.evidence_status==="original-marketplace-verified" &&
    hasOriginalLocator(sale)
  );
};
const scope=readJson("data/derived/"+product+"-hobby-team-ev-scope-v2.json");
const ev=readJson("data/derived/"+product+"-team-ev-progress.json");
const categories=["base_parallels","inserts","autographs"];

const tasks=[];
for(const [team,row] of Object.entries(scope.teams||{})){
  for(const category of categories){
    const item=row.categories?.[category]||{};
    const priority=
      item.status==="partial" ? 1 :
      team==="Chelsea" && item.status==="not-started" ? 2 :
      item.status==="not-applicable" ? 9 :
      3;
    const eligible=Number(item.eligible_contribution_count||0);
    const valued=Number(item.valued_contribution_count||0);
    const remaining=Number(item.remaining_contribution_count||0);
    tasks.push({
      id:(team+"-"+category).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,""),
      team,
      category,
      status:item.status,
      eligible_contribution_count:eligible,
      valued_contribution_count:valued,
      remaining_contribution_count:remaining,
      coverage_percent:item.coverage_percent===null
        ? null
        : Number(item.coverage_percent),
      priority,
      next_action:["complete","not-applicable"].includes(item.status)
        ? "none"
        : item.status==="partial"
          ? "value remaining "+remaining+" of "+eligible+" eligible contribution slots"
          : "begin valuation of "+eligible+" eligible contribution slots"
    });
  }
}
tasks.sort((a,b)=>a.priority-b.priority || b.valued_contribution_count-a.valued_contribution_count || a.team.localeCompare(b.team) || a.category.localeCompare(b.category));

const evQueue={
  schema_version:2,
  product_id:scope.product_id,
  format_id:scope.format_id,
  generated_at:scope.generated_at,
  model:"ev-work-queue-v2",
  summary:{
    task_count:tasks.length,
    complete_task_count:tasks.filter(x=>x.status==="complete").length,
    partial_task_count:tasks.filter(x=>x.status==="partial").length,
    not_started_task_count:tasks.filter(x=>x.status==="not-started").length,
    not_applicable_task_count:tasks.filter(x=>x.status==="not-applicable").length,
    eligible_contribution_count:tasks.reduce((sum,x)=>sum+x.eligible_contribution_count,0),
    valued_contribution_count:tasks.reduce((sum,x)=>sum+x.valued_contribution_count,0),
    remaining_contribution_count:tasks.reduce((sum,x)=>sum+x.remaining_contribution_count,0),
    teams_with_ev_progress:new Set(tasks.filter(x=>x.valued_contribution_count>0).map(x=>x.team)).size
  },
  tasks
};

const items=[];
for(const [team,row] of Object.entries(ev.teams||{})){
  for(const item of row.contributions||[]){
    const originalVerified=
      contributionOriginalVerified(item.market_source_file);
    items.push({
      team,
      card_id:item.card_id,
      player:item.player||null,
      set:item.set||null,
      parallel:item.parallel||null,
      ev_contribution_usd:Number(item.ev_contribution_usd||0),
      market_source_file:item.market_source_file,
      original_marketplace_verified:originalVerified,
      verification_status:originalVerified
        ? "verified-original-marketplace"
        : "pending-original-verification"
    });
  }
}
items.sort((a,b)=>b.ev_contribution_usd-a.ev_contribution_usd || a.card_id.localeCompare(b.card_id));
items.forEach((item,index)=>item.priority_rank=index+1);

const marketQueue={
  schema_version:1,
  product_id:scope.product_id,
  format_id:scope.format_id,
  generated_at:scope.generated_at,
  model:"market-verification-queue-v1",
  prioritization:"Highest current EV contribution first; no market value is modified by this queue.",
  summary:{
    contribution_count:items.length,
    original_verified_count:items.filter(x=>x.original_marketplace_verified).length,
    pending_original_verification_count:items.filter(x=>!x.original_marketplace_verified).length
  },
  items
};

const check=process.argv.includes("--check");
writeOrCheck("data/derived/"+product+"-hobby-ev-work-queue-v2.json",evQueue,check);
writeOrCheck("data/market/"+product+"/market-verification-queue-v1.json",marketQueue,check);
console.log(check?"v1.3 pipeline outputs are current":"v1.3 pipeline outputs regenerated");
