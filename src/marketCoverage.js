// BreakMetric market evidence coverage model v1.
(function(root){
  "use strict";

  const api={};
  const n=value=>{
    const x=Number(value);
    return Number.isFinite(x) ? x : 0;
  };

  api.build=function(entry=null){
    if(!entry){
      return {
        status:"none",
        audited:0,
        original:0,
        secondary:0,
        original_share:null,
        roi_eligible:false
      };
    }
    const audited=n(entry.audited_contribution_count);
    const original=n(entry.original_marketplace_verified_contribution_count);
    const secondary=n(entry.secondary_source_contribution_count);
    return {
      status:entry.market_evidence_status||"none",
      audited,
      original,
      secondary,
      original_share:audited>0 ? original/audited : null,
      roi_eligible:entry.roi_eligible===true
    };
  };

  api.statusLabel=function(row={}){
    if(!row.audited) return "No audited market evidence";
    if(row.status==="original-marketplace-verified") return "Original marketplace verified";
    if(row.status==="secondary-source-only") return "Secondary-source only";
    if(row.status==="mixed") return "Mixed source evidence";
    return "Audited market evidence";
  };

  api.shareLabel=function(row={}){
    if(row.original_share===null) return "Not available";
    return (row.original_share*100).toFixed(0)+"% original-verified";
  };

  api.validate=function(row={}){
    const errors=[];
    for(const key of ["audited","original","secondary"]){
      if(!Number.isFinite(Number(row[key])) || Number(row[key])<0){
        errors.push("invalid market evidence count: "+key);
      }
    }
    if(row.original>row.audited) errors.push("original count exceeds audited count");
    if(row.secondary>row.audited) errors.push("secondary count exceeds audited count");
    if(row.original_share!==null &&
       (!Number.isFinite(row.original_share) || row.original_share<0 || row.original_share>1)){
      errors.push("invalid original verification share");
    }
    return {valid:errors.length===0,errors};
  };

  root.BreakMetricMarketCoverage=Object.freeze(api);
})(typeof window!=="undefined" ? window : globalThis);
