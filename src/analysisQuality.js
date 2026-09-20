// BreakMetric analysis quality model v1.
// Converts low-level readiness, EV and market evidence into concise user-facing states.
(function(root){
  "use strict";

  const api={};
  const levels=["none","provisional","low","medium","high"];

  function number(value){
    const n=Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function clamp(value,min,max){
    return Math.min(max,Math.max(min,value));
  }

  api.marketConfidence=function(entry={}){
    const audited=number(entry.audited_contribution_count);
    const original=number(entry.original_marketplace_verified_contribution_count);
    const secondary=number(entry.secondary_source_contribution_count);

    if(!audited) return {level:"none",label:"No audited market data"};
    if(!original && secondary) {
      return {level:"provisional",label:"Secondary-source only"};
    }
    const share=clamp(original/Math.max(audited,1),0,1);
    if(original>=10 && share>=0.8) return {level:"high",label:"High source confidence"};
    if(original>=4 && share>=0.5) return {level:"medium",label:"Medium source confidence"};
    return {level:"low",label:"Limited verified market data"};
  };

  api.probabilityState=function(readiness={}){
    return readiness?.probability?.ready
      ? {state:"ready",label:"Probability ready"}
      : {state:"incomplete",label:"Probability incomplete"};
  };

  api.evState=function(teamEv={}){
    if(!teamEv || !number(teamEv.valued_card_count)){
      return {state:"none",label:"EV not valued",valued:0};
    }
    if(teamEv.coverage_complete===true){
      return {
        state:"complete",
        label:"EV coverage complete",
        valued:number(teamEv.valued_card_count)
      };
    }
    return {
      state:"partial",
      label:"EV coverage partial",
      valued:number(teamEv.valued_card_count)
    };
  };

  api.roiGate=function({teamEv=null,market=null,spotPrice=0}={}){
    if(!teamEv?.coverage_complete){
      return {eligible:false,reason:"EV coverage incomplete",code:"ev-incomplete"};
    }
    if(market?.roi_eligible!==true){
      return {eligible:false,reason:"Market-source verification incomplete",code:"market-unverified"};
    }
    if(!(number(spotPrice)>0)){
      return {eligible:false,reason:"Enter a spot price",code:"price-missing"};
    }
    return {eligible:true,reason:"ROI calculation active",code:"ready"};
  };

  api.build=function({
    readiness=null,
    teamEv=null,
    market=null,
    spotPrice=0,
    selectedPlayer=null
  }={}){
    const probability=api.probabilityState(readiness||{});
    const ev=api.evState(teamEv||{});
    const confidence=api.marketConfidence(market||{});
    const roi=api.roiGate({teamEv,market,spotPrice});

    return {
      probability,
      ev,
      market:confidence,
      roi,
      player_selected:Boolean(selectedPlayer),
      decision_ready:
        probability.state==="ready" &&
        ev.state==="complete" &&
        roi.eligible===true
    };
  };

  api.validate=function(summary={}){
    const errors=[];
    if(!["ready","incomplete"].includes(summary.probability?.state)){
      errors.push("invalid probability state");
    }
    if(!["none","partial","complete"].includes(summary.ev?.state)){
      errors.push("invalid EV state");
    }
    if(!levels.includes(summary.market?.level)){
      errors.push("invalid market confidence");
    }
    if(typeof summary.roi?.eligible!=="boolean"){
      errors.push("invalid ROI gate");
    }
    if(summary.decision_ready && summary.roi?.eligible!==true){
      errors.push("decision-ready summary has locked ROI");
    }
    return {valid:errors.length===0,errors};
  };

  api.summaryLines=function(summary={}){
    return [
      {key:"probability",label:"Probability",value:summary.probability?.label||"Unknown"},
      {key:"ev",label:"EV coverage",value:summary.ev?.label||"Unknown"},
      {key:"market",label:"Market evidence",value:summary.market?.label||"Unknown"},
      {key:"roi",label:"ROI",value:summary.roi?.reason||"Unknown"}
    ];
  };

  root.BreakMetricAnalysisQuality=Object.freeze(api);
})(typeof window!=="undefined" ? window : globalThis);
