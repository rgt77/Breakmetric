// BreakMetric EV coverage model v2.
// Uses an enumerated contribution-slot denominator without treating slot coverage as EV-weighted completeness.
(function(root){
  "use strict";

  const api={};

  function n(value){
    const x=Number(value);
    return Number.isFinite(x) ? x : 0;
  }

  function pct(valued,eligible){
    return eligible>0
      ? Math.round((valued/eligible*100)*10000)/10000
      : null;
  }

  api.build=function({teamEv=null,market=null,scope=null}={}){
    const eligible=n(scope?.eligible_contribution_count);
    const valued=n(
      scope?.valued_contribution_count ??
      teamEv?.valued_card_count
    );
    const remaining=Math.max(
      0,
      n(scope?.remaining_contribution_count || (eligible-valued))
    );
    const audited=n(market?.audited_contribution_count);
    const original=n(market?.original_marketplace_verified_contribution_count);
    const secondary=n(market?.secondary_source_contribution_count);
    const complete=scope?.coverage_complete===true || teamEv?.coverage_complete===true;
    const denominatorEnumerated=scope?.denominator_status==="enumerated" && eligible>0;
    const percentage=denominatorEnumerated ? pct(valued,eligible) : null;
    const blockers=[];

    if(!denominatorEnumerated){
      blockers.push("Eligible contribution denominator unavailable");
    }else if(remaining>0){
      blockers.push(
        remaining+" of "+eligible+" eligible contribution slots remain unvalued"
      );
    }
    if(valued && !market) blockers.push("Market evidence registry missing");
    if(market && market.status==="not-audited") blockers.push("Market evidence not audited");
    if(audited>0 && original<audited) blockers.push("Original-marketplace verification incomplete");
    if(secondary>0 && original===0) blockers.push("Current EV relies on secondary-source evidence");

    return {
      status:complete ? "complete" : valued ? "partial" : "none",
      coverage_complete:complete,
      eligible_contribution_count:eligible,
      valued_contribution_count:valued,
      remaining_contribution_count:remaining,
      audited_contribution_count:audited,
      original_verified_count:original,
      secondary_source_count:secondary,
      percentage,
      denominator_status:denominatorEnumerated ? "enumerated" : "not-established",
      percentage_semantics:"count-based-slot-coverage-not-ev-weighted",
      blockers
    };
  };

  api.label=function(row={}){
    if(row.denominator_status!=="enumerated") return "EV coverage denominator unavailable";
    const valued=n(row.valued_contribution_count);
    const eligible=n(row.eligible_contribution_count);
    const percentage=Number(row.percentage);
    const pctLabel=Number.isFinite(percentage) ? percentage.toFixed(1)+"%" : "—";
    if(row.status==="complete") return "Complete slot coverage · "+valued+"/"+eligible;
    return pctLabel+" slot coverage · "+valued+"/"+eligible+" valued";
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
    if(row.valued_contribution_count>row.eligible_contribution_count){
      errors.push("valued contribution count exceeds eligible denominator");
    }
    if(row.remaining_contribution_count!==
       row.eligible_contribution_count-row.valued_contribution_count){
      errors.push("remaining contribution count mismatch");
    }
    if(row.denominator_status==="enumerated"){
      const expected=pct(
        Number(row.valued_contribution_count),
        Number(row.eligible_contribution_count)
      );
      if(expected===null || Math.abs(Number(row.percentage)-expected)>0.0001){
        errors.push("EV slot coverage percentage mismatch");
      }
    }else if(row.percentage!==null){
      errors.push("EV coverage percentage requires enumerated denominator");
    }
    if(row.coverage_complete &&
       row.valued_contribution_count!==row.eligible_contribution_count){
      errors.push("complete EV coverage does not cover every eligible slot");
    }
    if(row.original_verified_count>row.audited_contribution_count){
      errors.push("verified contribution count exceeds audited count");
    }
    return {valid:errors.length===0,errors};
  };

  root.BreakMetricEvCoverage=Object.freeze(api);
})(typeof window!=="undefined" ? window : globalThis);
