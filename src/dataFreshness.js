// BreakMetric dataset freshness model v1.
(function(root){
  "use strict";

  const api={};

  api.parseDate=function(value){
    if(typeof value!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date=new Date(value+"T00:00:00Z");
    return Number.isNaN(date.getTime()) ? null : date;
  };

  api.daysOld=function(value,now=new Date()){
    const date=api.parseDate(value);
    if(!date) return null;
    return Math.max(0,Math.floor((now.getTime()-date.getTime())/86400000));
  };

  api.label=function(value,now=new Date()){
    const age=api.daysOld(value,now);
    if(age===null) return "Date unavailable";
    if(age===0) return value+" · today";
    return value+" · "+age+" day"+(age===1?"":"s")+" old";
  };

  api.build=function({
    productIntegrity=null,
    formatIntegrity=null,
    marketRegistry=null
  }={}){
    return {
      product_validated_at:productIntegrity?.validated_at||null,
      format_validated_at:formatIntegrity?.validated_at||null,
      market_generated_at:marketRegistry?.generated_at||null
    };
  };

  api.validate=function(row={}){
    const errors=[];
    for(const [key,value] of Object.entries(row)){
      if(value!==null && !api.parseDate(value)) errors.push("invalid freshness date: "+key);
    }
    return {valid:errors.length===0,errors};
  };

  root.BreakMetricFreshness=Object.freeze(api);
})(typeof window!=="undefined" ? window : globalThis);
