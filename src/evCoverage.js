// BreakMetric EV coverage model v1.
// Reports what is known without inventing a false percentage denominator.
(function(root){
  "use strict";

  const api={};

  function n(value){
    const x=Number(value);
    return Number.isFinite(x) ? x : 0;
  }

  api.build=function({teamEv=null,market=null}={}){
    const valued=n(teamEv?.valued_card_count);
    const audited=n(market?.audited_contribution_count);
    const original=n(market?.original_marketplace_verified_contribution_count);
    const secondary=n(market?.secondary_source_contribution_count);
    const complete=teamEv?.coverage_complete===true;
    const blockers=[];

    if(!valued) blockers.push("No card-level EV contributions yet");
    if(valued && !complete) blockers.push("Full value-bearing-card denominator not yet covered");
    if(valued && !market) blockers.push("Market evidence registry missing");
    if(market && market.status==="not-audited") blockers.push("Market evidence not audited");
    if(audited>0 && original<audited) blockers.push("Original-marketplace verification incomplete");
    if(secondary>0 && original===0) blockers.push("Current EV relies on secondary-source evidence");

    return {
      status:complete ? "complete" : valued ? "partial" : "none",
      coverage_complete:complete,
      valued_card_count:valued,
      audited_contribution_count:audited,
      original_verified_count:original,
      secondary_source_count:secondary,
      percentage:null,
      denominator_status:complete ? "complete-definition" : "not-established",
      blockers
    };
  };

  api.label=function(row={}){
    if(row.status==="complete") return "Complete EV coverage";
    if(row.status==="partial") return "Partial EV · "+n(row.valued_card_count)+" valued cards";
    return "EV not valued";
  };

  api.sourceLabel=function(row={}){
    if(!n(row.audited_contribution_count)) return "No audited market contributions";
    return (
      n(row.original_verified_count)+"/"+
      n(row.audited_contribution_count)+
      " original-marketplace verified"
    );
  };

  api.validate=function(row={}){
    const errors=[];
    if(!["none","partial","complete"].includes(row.status)) errors.push("invalid EV coverage status");
    if(row.percentage!==null) errors.push("EV coverage percentage must stay null until a defensible denominator is modeled");
    if(row.coverage_complete && row.denominator_status!=="complete-definition"){
      errors.push("complete EV lacks complete denominator definition");
    }
    if(row.original_verified_count>row.audited_contribution_count){
      errors.push("verified contribution count exceeds audited count");
    }
    return {valid:errors.length===0,errors};
  };

  root.BreakMetricEvCoverage=Object.freeze(api);
})(typeof window!=="undefined" ? window : globalThis);
