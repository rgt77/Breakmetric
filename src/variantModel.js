// BreakMetric canonical variant model v1.
(function(root){
  "use strict";
  const api={};
  const text=v=>typeof v==="string"?v.trim():"";
  const slug=v=>String(v??"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
  const serial=v=>v==null||v===""?null:Number(v);
  api.variantId=({product_id,card_id,parallel,serial_numbering,autograph=false})=>{
    const run=serial(serial_numbering);
    return [product_id,card_id,slug(parallel)||"base",run==null?"unserialed":"to-"+run,autograph?"auto":"non-auto"].map(slug).join("::");
  };
  api.normalize=function(row={},context={}){
    const errors=[];
    const productId=text(row.product_id||context.product_id), cardId=text(row.card_id||context.card_id), parallel=text(row.parallel)||"Base";
    const run=serial(row.serial_numbering);
    const autograph=row.autograph===true||context.autograph===true;
    if(!productId) errors.push("variant product_id missing");
    if(!cardId) errors.push("variant card_id missing");
    if(context.product_id&&productId!==context.product_id) errors.push("variant product_id mismatch");
    if(context.card_id&&cardId!==context.card_id) errors.push("variant card_id mismatch");
    if(run!==null&&(!Number.isInteger(run)||run<1)) errors.push("invalid serial_numbering");
    const variant_id=api.variantId({product_id:productId,card_id:cardId,parallel,serial_numbering:run,autograph});
    return Object.freeze({...row,product_id:productId,card_id:cardId,parallel,serial_numbering:run,autograph,variant_id,valid:errors.length===0,errors:Object.freeze(errors)});
  };
  api.validateSet=function(rows=[],context={}){
    const errors=[],seen=new Set(),variants=[];
    for(const row of rows){const v=api.normalize(row,context);variants.push(v);errors.push(...v.errors);if(seen.has(v.variant_id))errors.push("duplicate variant identity: "+v.variant_id);seen.add(v.variant_id);}
    return Object.freeze({valid:errors.length===0,errors:Object.freeze(errors),variants:Object.freeze(variants)});
  };
  root.BreakMetricVariants=Object.freeze(api);
})(typeof window!=="undefined"?window:globalThis);
