// BreakMetric market evidence quality v1.
(function(root){
  "use strict";
  const api={};

  function n(value){
    const x=Number(value);
    return Number.isFinite(x)?x:0;
  }

  api.verificationImpact=function(queue={}){
    const rows=queue.items||[];
    const total=rows.reduce((sum,row)=>sum+n(row.ev_contribution_usd),0);
    const verified=rows.filter(row=>row.original_marketplace_verified)
      .reduce((sum,row)=>sum+n(row.ev_contribution_usd),0);
    const pending=Math.max(0,total-verified);
    return {
      contribution_count:rows.length,
      total_ev_usd:total,
      original_verified_ev_usd:verified,
      pending_verification_ev_usd:pending,
      verified_ev_share:total>0?verified/total:null
    };
  };

  api.sourceTier=function(market={}){
    const audited=n(market.audited_contribution_count);
    const original=n(market.original_marketplace_verified_contribution_count);
    const secondary=n(market.secondary_source_contribution_count);
    if(!audited) return {tier:null,id:"none",label:"No audited market evidence"};
    if(original===audited && audited>0) return {tier:1,id:"original-marketplace-verified",label:"Original marketplace verified"};
    if(original>0) return {tier:2,id:"mixed",label:"Mixed original / secondary evidence"};
    if(secondary>0) return {tier:2,id:"secondary-source-realized-sale",label:"Secondary-source realized sales"};
    return {tier:3,id:"discovery-only",label:"Discovery-only evidence"};
  };

  api.verificationGap=function(market={}){
    const audited=n(market.audited_contribution_count);
    const original=n(market.original_marketplace_verified_contribution_count);
    return {
      audited,
      original,
      pending:Math.max(0,audited-original),
      complete:audited>0 && audited===original
    };
  };

  api.qualityLabel=function({market=null,queue=null}={}){
    const tier=api.sourceTier(market||{});
    const gap=api.verificationGap(market||{});
    const impact=api.verificationImpact(queue||{});
    if(tier.tier===null) return "No market evidence";
    if(tier.tier===1 && gap.complete) return "Verified market evidence";
    if(tier.id==="mixed") return "Partially verified market evidence";
    if(tier.tier===2) return "Provisional market evidence";
    return "Market evidence excluded from EV";
  };

  api.validate=function({market=null,queue=null}={}){
    const errors=[];
    const gap=api.verificationGap(market||{});
    const impact=api.verificationImpact(queue||{});
    if(gap.original>gap.audited) errors.push("original verified contributions exceed audited contributions");
    if(impact.original_verified_ev_usd>impact.total_ev_usd+0.0001) errors.push("verified EV impact exceeds total EV impact");
    if(impact.verified_ev_share!==null && (impact.verified_ev_share<0 || impact.verified_ev_share>1)) errors.push("verified EV share invalid");
    return {valid:errors.length===0,errors};
  };

  root.BreakMetricMarketEvidenceQuality=Object.freeze(api);
})(typeof window!=="undefined" ? window : globalThis);
