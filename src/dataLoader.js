// BreakMetric JSON data loader v1.
// In-memory cache + in-flight deduplication + bounded retry for static datasets.
(function(root){
  "use strict";

  const api={};
  const cache=new Map();
  const inFlight=new Map();

  function transientStatus(status){
    return status===408 || status===429 || status>=500;
  }

  async function request(path,{timeoutMs=12000}={}){
    const controller=typeof AbortController!=="undefined" ? new AbortController() : null;
    const timer=controller ? setTimeout(()=>controller.abort(),timeoutMs) : null;
    try{
      const response=await fetch(path,controller ? {signal:controller.signal} : undefined);
      if(!response.ok){
        const error=new Error("Dataset request failed: "+response.status+" "+path);
        error.status=response.status;
        error.transient=transientStatus(response.status);
        throw error;
      }
      try{
        return await response.json();
      }catch(error){
        const wrapped=new Error("Dataset JSON parse failed: "+path);
        wrapped.cause=error;
        wrapped.transient=false;
        throw wrapped;
      }
    }finally{
      if(timer) clearTimeout(timer);
    }
  }

  api.loadJson=async function(path,{timeoutMs=12000,retries=1,useCache=true}={}){
    if(typeof path!=="string" || !path){
      throw new Error("Dataset path required");
    }

    if(useCache && cache.has(path)) return cache.get(path);
    if(inFlight.has(path)) return inFlight.get(path);

    const task=(async()=>{
      let attempt=0;
      while(true){
        try{
          const data=await request(path,{timeoutMs});
          if(useCache) cache.set(path,data);
          return data;
        }catch(error){
          const aborted=error?.name==="AbortError";
          const retryable=aborted || error?.transient===true || error instanceof TypeError;
          if(attempt>=retries || !retryable) throw error;
          attempt++;
        }
      }
    })();

    inFlight.set(path,task);
    try{
      return await task;
    }finally{
      inFlight.delete(path);
    }
  };

  api.has=function(path){
    return cache.has(path);
  };

  api.clear=function(path=null){
    if(path) cache.delete(path);
    else cache.clear();
  };

  api.stats=function(){
    return {cached:cache.size,in_flight:inFlight.size};
  };

  root.BreakMetricDataLoader=Object.freeze(api);
})(typeof window!=="undefined" ? window : globalThis);
