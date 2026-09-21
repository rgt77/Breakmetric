import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const queuePath="data/market/2026-topps-chrome-premier-league/market-verification-queue-v1.json";
const outputPath="data/market/2026-topps-chrome-premier-league/market-verification-tasks-v1.json";
const check=process.argv.includes("--check");

const readJson=file=>JSON.parse(fs.readFileSync(path.join(root,file),"utf8"));
const queue=readJson(queuePath);

const contributions=(queue.items||[]).map(item=>{
  const record=readJson(item.market_source_file);
  const sales=(record.sales||[]).map((sale,index)=>({
    sale_index:index,
    sale_date:sale.sale_date,
    sale_price_usd:Number(sale.sale_price),
    marketplace:sale.marketplace||null,
    serial_copy:sale.serial_copy||null,
    discovery_source:sale.discovery_source||null,
    secondary_source_reference:sale.source_reference||null,
    source_sale_id:sale.source_sale_id||sale.listing_id||null,
    direct_marketplace_url:
      sale.direct_marketplace_url_recovered===true
        ? sale.direct_marketplace_url||sale.original_marketplace_url||null
        : null,
    original_marketplace_verified:sale.original_marketplace_verified===true,
    verification_status:
      sale.original_marketplace_verified===true
        ? "verified-original-marketplace"
        : "pending-original-marketplace",
    required_evidence:[
      "direct original marketplace sale URL or stable original marketplace sale identifier",
      "sale identity matching card/player/parallel",
      "sale price matching stored realized sale",
      "sale date matching stored realized sale"
    ]
  }));

  const verifiedSales=sales.filter(sale=>sale.original_marketplace_verified).length;
  return {
    task_id:
      queue.product_id+"::"+queue.format_id+"::"+
      item.team+"::"+item.card_id,
    priority_rank:item.priority_rank,
    team:item.team,
    card_id:item.card_id,
    player:item.player,
    set:item.set,
    parallel:item.parallel,
    ev_contribution_usd:Number(item.ev_contribution_usd),
    market_source_file:item.market_source_file,
    supporting_sale_count:sales.length,
    verified_original_sale_count:verifiedSales,
    pending_original_sale_count:Math.max(0,sales.length-verifiedSales),
    contribution_verification_status:
      sales.length>0 && verifiedSales===sales.length
        ? "verified-original-marketplace"
        : "pending-original-marketplace",
    contribution_original_marketplace_verified:
      sales.length>0 && verifiedSales===sales.length,
    sales
  };
});

const verified=contributions.filter(row=>row.contribution_original_marketplace_verified).length;
const pendingSales=contributions.reduce((sum,row)=>sum+row.pending_original_sale_count,0);
const totalSales=contributions.reduce((sum,row)=>sum+row.supporting_sale_count,0);
const totalEv=contributions.reduce((sum,row)=>sum+Number(row.ev_contribution_usd||0),0);
const pendingEv=contributions
  .filter(row=>!row.contribution_original_marketplace_verified)
  .reduce((sum,row)=>sum+Number(row.ev_contribution_usd||0),0);

const output={
  schema_version:1,
  product_id:queue.product_id,
  format_id:queue.format_id,
  generated_at:"2026-09-21",
  model:"market-verification-tasks-v1",
  policy:"Contribution verification requires every realized sale used by the stored market-value sample to have qualifying original marketplace evidence.",
  source_queue:queuePath,
  summary:{
    contribution_count:contributions.length,
    original_verified_contribution_count:verified,
    pending_contribution_count:contributions.length-verified,
    supporting_sale_count:totalSales,
    pending_original_sale_count:pendingSales,
    total_ev_usd:Number(totalEv.toFixed(4)),
    pending_verification_ev_usd:Number(pendingEv.toFixed(4))
  },
  contributions
};

const text=JSON.stringify(output,null,2)+"\n";
if(check){
  const current=fs.existsSync(path.join(root,outputPath))
    ? fs.readFileSync(path.join(root,outputPath),"utf8")
    : "";
  if(current!==text){
    console.error(JSON.stringify({
      result:"fail",
      reason:"market verification tasks are stale"
    },null,2));
    process.exit(1);
  }
  console.log(JSON.stringify({
    result:"pass",
    contribution_count:contributions.length,
    supporting_sale_count:totalSales,
    pending_original_sale_count:pendingSales
  },null,2));
}else{
  fs.writeFileSync(path.join(root,outputPath),text);
  console.log(JSON.stringify({
    result:"written",
    contribution_count:contributions.length,
    supporting_sale_count:totalSales,
    pending_original_sale_count:pendingSales
  },null,2));
}
