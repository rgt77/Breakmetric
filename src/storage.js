// BreakMetric resilient storage v1.
// Uses browser localStorage when available and an in-memory session fallback otherwise.
(function(root){
  "use strict";

  const api={};\n  const MAX_KEY_LENGTH=120,MAX_VALUE_LENGTH=20000;
  const fallback=new Map();
  let persistentAvailable=false;
  let readFailures=0;
  let writeFailures=0;
  let removeFailures=0;

  function storage(){
    try{
      return root.localStorage || null;
    }catch(_){
      return null;
    }
  }

  function probe(){
    const store=storage();
    if(!store){
      persistentAvailable=false;
      return;
    }
    const key="__breakmetric_storage_probe__";
    try{
      store.setItem(key,"1");
      store.removeItem(key);
      persistentAvailable=true;
    }catch(_){
      persistentAvailable=false;
    }
  }

  probe();

  api.get=function(key,fallbackValue=null){
    const name=String(key);
    if(persistentAvailable){
      try{
        const value=storage().getItem(name);
        if(value!==null) return value;
      }catch(_){
        readFailures++;
        persistentAvailable=false;
      }
    }
    return fallback.has(name) ? fallback.get(name) : fallbackValue;
  };

  api.set=function(key,value){
    const name=String(key);
    const stringValue=String(value);
    fallback.set(name,stringValue);
    if(persistentAvailable){
      try{
        storage().setItem(name,stringValue);
        return {persistent:true};
      }catch(_){
        writeFailures++;
        persistentAvailable=false;
      }
    }
    return {persistent:false};
  };

  api.remove=function(key){
    const name=String(key);
    fallback.delete(name);
    if(persistentAvailable){
      try{
        storage().removeItem(name);
        return {persistent:true};
      }catch(_){
        removeFailures++;
        persistentAvailable=false;
      }
    }
    return {persistent:false};
  };

  api.getJson=function(key,fallbackValue=null){
    const raw=api.get(key,null);
    if(raw===null) return fallbackValue;
    try{
      return JSON.parse(raw);
    }catch(_){
      return fallbackValue;
    }
  };

  api.setJson=function(key,value){
    return api.set(key,JSON.stringify(value));
  };

  api.mode=function(){
    return persistentAvailable ? "persistent" : "session-fallback";
  };

  api.diagnostics=function(){
    return {
      mode:api.mode(),
      persistent_available:persistentAvailable,
      fallback_entry_count:fallback.size,
      read_failures:readFailures,
      write_failures:writeFailures,
      remove_failures:removeFailures
    };
  };

  root.BreakMetricStorage=Object.freeze(api);
})(typeof window!=="undefined" ? window : globalThis);
