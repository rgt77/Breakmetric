// BreakMetric FX rate fetcher v1.
// Bounded external FX requests with explicit timeout and validation.
(function(root){
  "use strict";

  const api={};

  api.fetchRate=async function(from,to,{
    fetchImpl=root.fetch,
    timeoutMs=8000,
    AbortControllerCtor=root.AbortController
  }={}){
    if(from===to) return {rate:1,date:null};
    if(typeof fetchImpl!=="function") throw new Error("FX fetch unavailable");

    const controller=
      typeof AbortControllerCtor==="function"
        ? new AbortControllerCtor()
        : null;
    const timer=
      controller
        ? setTimeout(()=>controller.abort(),Math.max(1,Number(timeoutMs)||8000))
        : null;

    try{
      const response=await fetchImpl(
        `https://api.frankfurter.dev/v2/rate/${String(from).toLowerCase()}/${String(to).toLowerCase()}`,
        controller ? {signal:controller.signal} : undefined
      );
      if(!response?.ok){
        const error=new Error("Exchange-rate request failed");
        error.status=response?.status ?? null;
        throw error;
      }
      const data=await response.json();
      const rate=Number(data?.rate);
      if(!Number.isFinite(rate) || rate<=0){
        throw new Error("Invalid exchange rate");
      }
      return {rate,date:data?.date||null};
    }finally{
      if(timer) clearTimeout(timer);
    }
  };

  root.BreakMetricFxRate=Object.freeze(api);
})(typeof window!=="undefined" ? window : globalThis);
