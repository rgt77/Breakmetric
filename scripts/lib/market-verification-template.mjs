import {
  hasOriginalLocator
} from "./market-verification-evidence.mjs";

function text(value){
  return typeof value==="string" ? value.trim() : "";
}

export function saleVerified(sale={}){
  return (
    sale.original_marketplace_verified===true &&
    sale.evidence_status==="original-marketplace-verified" &&
    hasOriginalLocator(sale,sale.marketplace||"")
  );
}

export function buildVerificationTasks({
  queue={},
  recordsBySource={},
  team=null
}={}){
  const tasks=[];

  for(const contribution of queue.items||[]){
    if(team && contribution.team!==team) continue;

    const source=contribution.market_source_file;
    const record=recordsBySource[source];
    if(!record) continue;

    for(const [saleIndex,sale] of (record.sales||[]).entries()){
      const verified=saleVerified(sale);
      tasks.push({
        task_id:[
          queue.product_id||"",
          queue.format_id||"",
          contribution.team||"",
          contribution.card_id||"",
          saleIndex
        ].join("::"),
        contribution_priority_rank:Number(contribution.priority_rank),
        sale_index:saleIndex,
        product_id:queue.product_id||record.product_id||null,
        card_number:record.card_number||null,
        serial_numbering:Number(record.serial_numbering),
        team:contribution.team||null,
        card_id:contribution.card_id||null,
        player:contribution.player||null,
        set:contribution.set||null,
        parallel:contribution.parallel||null,
        ev_contribution_usd:Number(contribution.ev_contribution_usd||0),
        market_source_file:source||null,
        sale_date:sale.sale_date||null,
        sale_price_usd:Number(sale.sale_price),
        marketplace:sale.marketplace||null,
        serial_copy:sale.serial_copy||null,
        verification_status:verified
          ? "verified-original-marketplace"
          : "pending-original-marketplace"
      });
    }
  }

  tasks.sort((a,b)=>
    (a.contribution_priority_rank??Number.MAX_SAFE_INTEGER)-
      (b.contribution_priority_rank??Number.MAX_SAFE_INTEGER) ||
    a.sale_index-b.sale_index ||
    String(a.task_id).localeCompare(String(b.task_id))
  );

  return tasks;
}

export function nextPendingTask(tasks=[],taskId=null){
  const pending=(tasks||[]).filter(
    task=>task.verification_status==="pending-original-marketplace"
  );
  if(taskId){
    return pending.find(task=>task.task_id===taskId)||null;
  }
  return pending[0]||null;
}

export function createEvidenceTemplate(task={},{
  queuePath=null,
  verifiedAt=""
}={}){
  if(!text(task.task_id)){
    throw new Error("verification task is required");
  }

  const template={
    schema_version:2,
    task_id:task.task_id,
    product_id:task.product_id,
    market_source_file:task.market_source_file,
    sale_index:Number(task.sale_index),
    card_id:task.card_id,
    player:task.player,
    set:task.set,
    parallel:task.parallel,
    sale_date:task.sale_date,
    sale_price_usd:Number(task.sale_price_usd),
    marketplace:task.marketplace,
    serial_copy:task.serial_copy||null,
    expected_identity:{
      card_number:task.card_number||null,
      parallel:task.parallel||null,
      print_run:Number(task.serial_numbering),
      player:task.player||null,
      team:task.team||null
    },
    listing_identity:{
      series:"",
      card_number:"",
      parallel:"",
      print_run:null,
      player:"",
      team:""
    },
    direct_marketplace_url:"",
    source_sale_id:"",
    verified_at:text(verifiedAt),
    verification_note:""
  };

  if(text(queuePath)){
    template.queue_path=text(queuePath);
  }

  return template;
}
