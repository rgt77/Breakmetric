// BreakMetric shareable URL state v1.
(function(root){
  "use strict";

  const api={};
  const keys=["product","format","team","player"];

  function clean(value){
    if(typeof value!=="string") return null;
    const trimmed=value.trim();
    if(!trimmed || trimmed.length>160) return null;
    if(/[\u0000-\u001f\u007f]/.test(trimmed)) return null;
    return trimmed;
  }

  api.read=function(search=""){
    const params=new URLSearchParams(search||"");
    const state={};
    for(const key of keys){
      state[key]=clean(params.get(key));
    }
    return state;
  };

  api.build=function(state={},basePath=""){
    const params=new URLSearchParams();
    for(const key of keys){
      const value=clean(state[key]);
      if(value) params.set(key,value);
    }
    const query=params.toString();
    return (basePath||"")+(query ? "?"+query : "");
  };

  api.apply=function(state={}){
    if(typeof history==="undefined" || typeof location==="undefined") return null;
    const next=api.build(state,location.pathname);
    history.replaceState(null,"",next+location.hash);
    return next;
  };

  api.validate=function(state={}){
    const errors=[];
    for(const key of keys){
      if(state[key]!==null && state[key]!==undefined && !clean(state[key])){
        errors.push("invalid URL state: "+key);
      }
    }
    return {valid:errors.length===0,errors};
  };

  root.BreakMetricUrlState=Object.freeze(api);
})(typeof window!=="undefined" ? window : globalThis);
