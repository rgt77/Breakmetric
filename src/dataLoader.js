// BreakMetric JSON data loader v2.
// Same-origin static JSON guard + cache + in-flight deduplication + bounded retry + concurrency-limited batch loading.
(function(root){
  "use strict";

  const api={};
  const cache=new Map();
  const inFlight=new Map();
  const metrics={
    requests:0,
    cache_hits:0,
    cache_misses:0,
    inflight_hits:0,
    retries:0,
    failures:0,
    parsed_bytes:0
  };

  function transientStatus(status){
    return status===408 || status===429 || status>=500;
  }

  function validStaticJsonPath(value){
    if(typeof value!=="string" || !value) return false;
    if(value.startsWith("/") || value.includes("://") || value.includes("\\") || value.includes("..")) return false;
    return value.startsWith("data/") && value.endsWith(".json");
  }

  function assertPath(path){
    if(!validStaticJsonPath(path)){
      throw new Error("Unsafe dataset path rejected: "+String(path));
    }
  }

  async function request(path,{timeoutMs=12000,maxBytes=5_000_000}={}){
    assertPath(path);
    metrics.requests++;
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

      const declared=Number(response.headers?.get?.("content-length"));
      if(Number.isFinite(declared) && declared>maxBytes){
        const error=new Error("Dataset exceeds size limit: "+path);
        error.transient=false;
        throw error;
      }

      const text=await response.text();
      if(text.length>maxBytes){
        const error=new Error("Dataset exceeds size limit: "+path);
        error.transient=false;
        throw error;
      }
      metrics.parsed_bytes+=text.length;

      try{
        return JSON.parse(text);
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

  api.isValidPath=validStaticJsonPath;

  api.loadJson=async function(path,{
    timeoutMs=12000,
    retries=1,
    useCache=true,
    maxBytes=5_000_000
  }={}){
    assertPath(path);

    if(useCache && cache.has(path)){
      metrics.cache_hits++;
      return cache.get(path);
    }
    if(inFlight.has(path)){
      metrics.inflight_hits++;
      return inFlight.get(path);
    }
    metrics.cache_misses++;

    const task=(async()=>{
      let attempt=0;
      while(true){
        try{
          const data=await request(path,{timeoutMs,maxBytes});
          if(useCache) cache.set(path,data);
          return data;
        }catch(error){
          const aborted=error?.name==="AbortError";
          const retryable=aborted || error?.transient===true || error instanceof TypeError;
          if(attempt>=retries || !retryable){
            metrics.failures++;
            throw error;
          }
          metrics.retries++;
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

  api.loadMany=async function(entries,{
    concurrency=6,
    timeoutMs=12000,
    retries=1,
    useCache=true,
    maxBytes=5_000_000
  }={}){
    if(!entries || Array.isArray(entries) || typeof entries!=="object"){
      throw new Error("loadMany requires a key/path object");
    }
    const rows=Object.entries(entries);
    for(const [,path] of rows) assertPath(path);
    const limit=Math.max(1,Math.min(12,Math.floor(Number(concurrency)||6)));
    const output={};
    let cursor=0;

    async function worker(){
      while(cursor<rows.length){
        const index=cursor++;
        const [key,path]=rows[index];
        output[key]=await api.loadJson(path,{timeoutMs,retries,useCache,maxBytes});
      }
    }

    await Promise.all(
      Array.from({length:Math.min(limit,rows.length)},()=>worker())
    );
    return output;
  };

  api.prefetch=async function(paths=[],options={}){
    const unique=[...new Set(paths.filter(validStaticJsonPath))];
    const entries=Object.fromEntries(unique.map((path,index)=>["p"+index,path]));
    try{
      await api.loadMany(entries,{...options,useCache:true});
      return {loaded:unique.length,failed:0};
    }catch(_){
      return {loaded:0,failed:unique.length};
    }
  };

  api.has=function(path){
    return cache.has(path);
  };

  api.clear=function(path=null){
    if(path) cache.delete(path);
    else cache.clear();
  };

  api.resetStats=function(){
    for(const key of Object.keys(metrics)) metrics[key]=0;
  };

  api.stats=function(){
    return {
      cached:cache.size,
      in_flight:inFlight.size,
      ...metrics
    };
  };

  root.BreakMetricDataLoader=Object.freeze(api);
})(typeof window!=="undefined" ? window : globalThis);
