// BreakMetric checklist engine v1.
(function(root){
  "use strict";
  const api={};
  const text=v=>typeof v==="string"?v.trim():"";
  const slug=v=>String(v??"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
  const familyOf=(dataset={})=>text(dataset.section)||slug(dataset.set)||"unknown";
  api.cardId=(productId,family,cardNumber)=>[productId,family,String(cardNumber)].map(slug).join("::");
  api.normalize=function(dataset={},metadata={}){
    const errors=[], seen=new Set(), productId=text(dataset.product_id), family=familyOf(dataset);
    if(!productId) errors.push("checklist product_id missing");
    if(metadata.id && productId!==metadata.id) errors.push("checklist product_id mismatch");
    const teams=new Set((metadata.teams||[]).map(x=>x?.name).filter(Boolean));
    if(!Array.isArray(dataset.cards)) errors.push("checklist cards missing");
    const cards=(dataset.cards||[]).map((row,index)=>{
      const cardNumber=String(row?.card_number??"").trim(), player=text(row?.player), team=text(row?.team);
      const cardId=api.cardId(productId,family,cardNumber);
      if(!cardNumber) errors.push("card_number missing at index "+index);
      if(!player) errors.push("player missing: "+cardNumber);
      if(!team) errors.push("team missing: "+cardNumber);
      if(teams.size && !teams.has(team)) errors.push("unknown team: "+team+" ("+cardNumber+")");
      if(seen.has(cardId)) errors.push("duplicate card identity: "+cardId);
      seen.add(cardId);
      return Object.freeze({...row,card_number:cardNumber,player,team,card_id:cardId,product_id:productId,card_family:family});
    });
    return Object.freeze({valid:errors.length===0,errors:Object.freeze(errors),product_id:productId,card_family:family,cards:Object.freeze(cards)});
  };
  api.validate=function(dataset={},metadata={}){const n=api.normalize(dataset,metadata);return {valid:n.valid,errors:[...n.errors],metrics:{card_count:n.cards.length,unique_card_count:new Set(n.cards.map(x=>x.card_id)).size}}};
  root.BreakMetricChecklist=Object.freeze(api);
})(typeof window!=="undefined"?window:globalThis);
