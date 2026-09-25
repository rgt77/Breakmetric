// BreakMetric user-safe error model v1.
(function(root){
  "use strict";

  const api={};
  const history=[];

  api.classify=function(error={}){
    if(error?.name==="StaleProductLoad") return "stale";
    if(error?.name==="DataContractError") return "contract";
    if(error?.name==="DataVersionChanged") return "version";
    if(error?.name==="AbortError") return "timeout";
    if(String(error?.message||"").includes("JSON parse")) return "parse";
    if(Number.isFinite(Number(error?.status))) return "http";
    if(error instanceof TypeError) return "network";
    return "unknown";
  };

  api.userMessage=function(error={}){
    const type=api.classify(error);
    if(type==="contract") return "Analysis data failed an integrity contract and was blocked.";
    if(type==="version") return "Analysis data changed while loading. Retry to use one consistent version.";
    if(type==="timeout") return "Analysis data took too long to load.";
    if(type==="parse") return "A dataset could not be read safely.";
    if(type==="http") return "One of the analysis datasets is temporarily unavailable.";
    if(type==="network") return "Network access to the analysis data failed.";
    return "Analysis data could not be loaded safely.";
  };

  api.record=function(error={},context={}){
    const entry={
      at:new Date().toISOString(),
      type:api.classify(error),
      message:String(error?.message||"unknown error").replace(/[?&](?:t|token|key|api_key|authorization)=[^&\\s]+/gi,"?[redacted]").slice(0,300),
      product_id:context.productId||null,
      format_id:context.formatId||null
    };
    history.push(entry);
    if(history.length>20) history.shift();
    return entry;
  };

  api.entries=function(){
    return history.map(x=>({...x}));
  };

  api.clear=function(){
    history.length=0;
  };

  root.BreakMetricErrors=Object.freeze(api);
})(typeof window!=="undefined" ? window : globalThis);
