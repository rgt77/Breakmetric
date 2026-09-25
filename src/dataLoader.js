// BreakMetric JSON data loader v4.
// Same-origin JSON guard + versioned cache + in-flight dedupe + bounded retry + stable-version batch loading.
(function(root){
  "use strict";

  const api={};
  const cache=new Map();
  const inFlight=new Map();
  const activeControllers=new Set();
  const DEFAULT_VERSION_PATH="data/validation/runtime-data-version-v1.json";
  let currentVersion="unversioned";
  const metrics={
    requests:0,
    cache_hits:0,
    cache_misses:0,
    inflight_hits:0,
    retries:0,
    failures:0,
    parsed_bytes:0,
    version_checks:0,
    version_changes:0,
    cache_invalidations:0,
    version_restarts:0
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

  function cacheKey(path,version=currentVersion){
    return String(version||"unversioned")+"\0"+path;
  }

  function versionedUrl(path,version){
    const fingerprint=String(version||"").trim();
    if(!/^[a-f0-9]{64}$/i.test(fingerprint)) return path;
    return path+"?v="+encodeURIComponent(fingerprint);
  }

  async function request(path,{
    timeoutMs=12000,
    maxBytes=5_000_000,
    cacheMode="default",
    version=null
  }={}){
    assertPath(path);
    metrics.requests++;
    const controller=typeof AbortController!=="undefined" ? new AbortController() : null;
    if(controller) activeControllers.add(controller);
    const timer=controller ? setTimeout(()=>controller.abort(),timeoutMs) : null;
    try{
      const requestUrl=versionedUrl(path,version);
      const effectiveCacheMode=
        requestUrl===path ? cacheMode : "no-store";
      const fetchOptions={cache:effectiveCacheMode};
      if(controller) fetchOptions.signal=controller.signal;
      const response=await fetch(requestUrl,fetchOptions);
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
      if(controller) activeControllers.delete(controller);
    }
  }

  api.cacheSize=()=>cache.size;
  api.cancelAll=function(){for(const controller of activeControllers)controller.abort();activeControllers.clear();inFlight.clear();};
  api.clearCache=()=>{cache.clear();metrics.cache_invalidations++;};
  api.pruneCache=function(maxEntries=40){const max=Math.max(1,Number(maxEntries)||40);while(cache.size>max){cache.delete(cache.keys().next().value);metrics.cache_invalidations++;}return cache.size;};
  api.isValidPath=validStaticJsonPath;

  api.loadJson=async function(path,{
    timeoutMs=12000,
    retries=1,
    useCache=true,
    maxBytes=5_000_000,
    version=currentVersion
  }={}){
    assertPath(path);
    const key=cacheKey(path,version);

    if(useCache && cache.has(key)){
      metrics.cache_hits++;
      return cache.get(key);
    }
    if(inFlight.has(key)){
      metrics.inflight_hits++;
      return inFlight.get(key);
    }
    metrics.cache_misses++;

    const task=(async()=>{
      let attempt=0;
      while(true){
        try{
          const data=await request(path,{
            timeoutMs,
            maxBytes,
            version
          });
          if(useCache){cache.set(key,data);api.pruneCache(40);}
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

    inFlight.set(key,task);
    try{
      return await task;
    }finally{
      inFlight.delete(key);
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
    const versionAtStart=currentVersion;
    let cursor=0;

    async function worker(){
      while(cursor<rows.length){
        const index=cursor++;
        const [key,path]=rows[index];
        output[key]=await api.loadJson(path,{
          timeoutMs,
          retries,
          useCache,
          maxBytes,
          version:versionAtStart
        });
      }
    }

    await Promise.all(
      Array.from({length:Math.min(limit,rows.length)},()=>worker())
    );
    return output;
  };

  api.syncVersion=async function(
    versionPath=DEFAULT_VERSION_PATH,
    {timeoutMs=5000}={}
  ){
    assertPath(versionPath);
    metrics.version_checks++;
    const manifest=await request(versionPath,{
      timeoutMs,
      maxBytes:100_000,
      cacheMode:"no-store"
    });
    const fingerprint=String(manifest?.fingerprint||"").trim();
    if(!/^[a-f0-9]{64}$/i.test(fingerprint)){
      const error=new Error("Invalid runtime data fingerprint");
      error.transient=false;
      throw error;
    }

    if(currentVersion!==fingerprint){
      currentVersion=fingerprint;
      cache.clear();
      metrics.version_changes++;
      metrics.cache_invalidations++;
    }
    return manifest;
  };

  async function stableVersionLoad(loader,{
    versionPath=DEFAULT_VERSION_PATH,
    versionTimeoutMs=5000,
    versionRetries=1
  }={}){
    let attempt=0;
    while(true){
      const before=await api.syncVersion(versionPath,{
        timeoutMs:versionTimeoutMs
      });
      const fingerprint=before.fingerprint;
      const data=await loader(fingerprint);
      const after=await api.syncVersion(versionPath,{
        timeoutMs:versionTimeoutMs
      });
      if(after.fingerprint===fingerprint) return data;

      metrics.version_restarts++;
      if(attempt>=versionRetries){
        const error=new Error("Runtime data version changed during load");
        error.name="DataVersionChanged";
        error.transient=true;
        throw error;
      }
      attempt++;
    }
  }

  api.loadJsonVersioned=async function(path,options={}){
    assertPath(path);
    return stableVersionLoad(
      version=>api.loadJson(path,{...options,version}),
      options
    );
  };

  api.loadManyVersioned=async function(entries,options={}){
    return stableVersionLoad(
      async version=>{
        const rows=Object.entries(entries||{});
        if(!entries || Array.isArray(entries) || typeof entries!=="object"){
          throw new Error("loadManyVersioned requires a key/path object");
        }
        for(const [,path] of rows) assertPath(path);
        const concurrency=Math.max(
          1,
          Math.min(12,Math.floor(Number(options.concurrency)||6))
        );
        const output={};
        let cursor=0;

        async function worker(){
          while(cursor<rows.length){
            const index=cursor++;
            const [key,path]=rows[index];
            output[key]=await api.loadJson(path,{
              timeoutMs:options.timeoutMs,
              retries:options.retries,
              useCache:options.useCache,
              maxBytes:options.maxBytes,
              version
            });
          }
        }

        await Promise.all(
          Array.from(
            {length:Math.min(concurrency,rows.length)},
            ()=>worker()
          )
        );
        return output;
      },
      options
    );
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
    return cache.has(cacheKey(path));
  };

  api.clear=function(path=null){
    if(!path){
      cache.clear();
      return;
    }
    const suffix="\0"+path;
    for(const key of [...cache.keys()]){
      if(key.endsWith(suffix)) cache.delete(key);
    }
  };

  api.version=function(){
    return currentVersion;
  };

  api.resetStats=function(){
    for(const key of Object.keys(metrics)) metrics[key]=0;
  };

  api.stats=function(){
    return {
      cached:cache.size,
      in_flight:inFlight.size,
      version:currentVersion,
      ...metrics
    };
  };

  root.BreakMetricDataLoader=Object.freeze(api);
})(typeof window!=="undefined" ? window : globalThis);
