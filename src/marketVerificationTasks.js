// BreakMetric sale-level market verification task model v1.
(function(root){
  "use strict";

  const api={};

  function hasOriginalLocator(sale={}){
    const directUrl=
      sale.direct_marketplace_url ||
      sale.original_marketplace_url ||
      null;
    const stableSaleId=
      sale.source_sale_id ||
      sale.marketplace_sale_id ||
      sale.listing_id ||
      null;

    return (
      typeof directUrl==="string" &&
      /^https?:\/\//i.test(directUrl)
    ) || (
      typeof stableSaleId==="string" &&
      stableSaleId.trim().length>0
    );
  }

  api.saleVerified=function(sale={}){
    return (
      sale.original_marketplace_verified===true &&
      sale.evidence_status==="original-marketplace-verified" &&
      hasOriginalLocator(sale)
    );
  };

  api.build=function(queue={},recordsBySource={}){
    const tasks=[];

    for(const contribution of queue.items||[]){
      const source=contribution.market_source_file;
      const record=recordsBySource?.[source];
      if(!record) continue;

      const contributionRank=Number(contribution.priority_rank);
      for(const [saleIndex,sale] of (record.sales||[]).entries()){
        const verified=api.saleVerified(sale);
        tasks.push({
          task_id:[
            queue.product_id||"",
            queue.format_id||"",
            contribution.team||"",
            contribution.card_id||"",
            saleIndex
          ].join("::"),
          contribution_priority_rank:
            Number.isFinite(contributionRank) ? contributionRank : null,
          sale_index:saleIndex,
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
          discovery_source:sale.discovery_source||null,
          source_reference:sale.source_reference||null,
          source_sale_id:
            sale.source_sale_id ||
            sale.marketplace_sale_id ||
            sale.listing_id ||
            null,
          original_marketplace_verified:verified,
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
  };

  api.pending=function(tasks=[]){
    return (tasks||[]).filter(
      task=>task.verification_status==="pending-original-marketplace"
    );
  };

  api.next=function(tasks=[],team=null){
    return api.pending(tasks).find(
      task=>!team || task.team===team
    ) || null;
  };

  api.label=function(task=null){
    if(!task) return "No pending original-sale verification";
    const serial=task.serial_copy ? " · "+task.serial_copy : "";
    const date=task.sale_date ? " · "+task.sale_date : "";
    const marketplace=task.marketplace ? task.marketplace+" · " : "";
    return (
      "#"+task.contribution_priority_rank+" "+
      task.player+" · "+task.parallel+" · "+
      marketplace+"$"+Number(task.sale_price_usd).toFixed(2)+
      serial+date
    );
  };

  api.summary=function(tasks=[]){
    const rows=tasks||[];
    const verified=rows.filter(
      task=>task.verification_status==="verified-original-marketplace"
    ).length;
    const pending=Math.max(0,rows.length-verified);
    return {
      task_count:rows.length,
      original_verified_task_count:verified,
      pending_task_count:pending,
      complete:rows.length>0 && pending===0
    };
  };

  api.validate=function(tasks=[]){
    const errors=[];
    const ids=new Set();

    for(const task of tasks||[]){
      if(!task.task_id) errors.push("verification task missing id");
      else if(ids.has(task.task_id)) errors.push("duplicate verification task id");
      else ids.add(task.task_id);

      if(!Number.isInteger(task.sale_index) || task.sale_index<0){
        errors.push("verification task has invalid sale index");
      }
      if(
        !Number.isFinite(Number(task.contribution_priority_rank)) ||
        Number(task.contribution_priority_rank)<1
      ){
        errors.push("verification task has invalid contribution priority rank");
      }
      if(!Number.isFinite(Number(task.sale_price_usd)) || Number(task.sale_price_usd)<=0){
        errors.push("verification task has invalid sale price");
      }
      if(
        ![
          "pending-original-marketplace",
          "verified-original-marketplace"
        ].includes(task.verification_status)
      ){
        errors.push("verification task has invalid status");
      }
    }

    for(let i=1;i<tasks.length;i++){
      const prev=tasks[i-1];
      const curr=tasks[i];
      if(
        curr.contribution_priority_rank<prev.contribution_priority_rank ||
        (
          curr.contribution_priority_rank===prev.contribution_priority_rank &&
          curr.sale_index<prev.sale_index
        )
      ){
        errors.push("verification task order is not deterministic");
        break;
      }
    }

    return {valid:errors.length===0,errors};
  };

  root.BreakMetricMarketVerificationTasks=Object.freeze(api);
})(typeof window!=="undefined" ? window : globalThis);
