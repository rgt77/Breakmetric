// BreakMetric market-record quality v1.
// Evaluates sample size, recency, source verification and price spread without changing valuation.
(function(root){
  "use strict";
  const api={};

  function n(value){
    const x=Number(value);
    return Number.isFinite(x)?x:null;
  }

  function isoDate(value){
    return typeof value==="string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(value+"T00:00:00Z")
      : null;
  }

  api.sampleBand=function(count){
    const n=Number(count)||0;
    if(n>=10) return "high";
    if(n>=4) return "medium";
    if(n>=1) return "low";
    return "none";
  };

  api.recencyBand=function(ageDays){
    if(!Number.isFinite(Number(ageDays))) return "unknown";
    const age=Number(ageDays);
    if(age<=30) return "fresh";
    if(age<=90) return "current";
    if(age<=180) return "aging";
    return "stale";
  };

  api.evaluate=function(record={},asOf=new Date()){
    const sales=Array.isArray(record.sales)?record.sales:[];
    const prices=sales.map(x=>n(x.sale_price)).filter(x=>x!==null && x>=0);
    const validDates=sales
      .map(x=>({raw:x.sale_date,date:isoDate(x.sale_date)}))
      .filter(x=>x.date && !Number.isNaN(x.date.getTime()))
      .sort((a,b)=>a.date-b.date);
    const latest=validDates.length?validDates[validDates.length-1]:null;
    const age=latest
      ? Math.max(0,Math.floor((asOf.getTime()-latest.date.getTime())/86400000))
      : null;
    const original=sales.filter(x=>
      x.original_marketplace_verified===true &&
      x.direct_marketplace_url_recovered===true
    ).length;
    const secondary=sales.filter(x=>
      x.evidence_status==="secondary-source-realized-sale"
    ).length;
    const discovery=sales.filter(x=>x.evidence_status==="discovery-only").length;
    const min=prices.length?Math.min(...prices):null;
    const max=prices.length?Math.max(...prices):null;
    const spread=min!==null && min>0 ? max/min : null;

    return {
      player:record.player||null,
      team:record.team||null,
      card_number:record.card_number??null,
      set:record.set||null,
      parallel:record.parallel||null,
      sale_count:prices.length,
      original_verified_sale_count:original,
      secondary_source_sale_count:secondary,
      discovery_only_sale_count:discovery,
      latest_sale_date:latest?.raw||null,
      latest_sale_age_days:age,
      recency_status:api.recencyBand(age),
      sample_size_confidence:api.sampleBand(prices.length),
      min_usd:min,
      max_usd:max,
      price_spread_ratio:spread,
      market_value_usd:n(record.calculated_market_value?.median_usd) ??
        n(record.calculated_market_value?.median_price),
      market_value_status:record.calculated_market_value?.status||null,
      source_status:record.evidence_summary?.status||null
    };
  };

  api.aggregate=function(rows=[]){
    const valid=rows.filter(Boolean);
    const saleCount=valid.reduce((sum,row)=>sum+Number(row.sale_count||0),0);
    const original=valid.reduce((sum,row)=>sum+Number(row.original_verified_sale_count||0),0);
    const secondary=valid.reduce((sum,row)=>sum+Number(row.secondary_source_sale_count||0),0);
    const fresh=valid.filter(row=>row.recency_status==="fresh").length;
    const current=valid.filter(row=>row.recency_status==="current").length;
    const aging=valid.filter(row=>row.recency_status==="aging").length;
    const stale=valid.filter(row=>row.recency_status==="stale").length;
    const latest=valid.map(row=>row.latest_sale_date).filter(Boolean).sort().at(-1)||null;
    return {
      record_count:valid.length,
      sale_count:saleCount,
      original_verified_sale_count:original,
      secondary_source_sale_count:secondary,
      fresh_record_count:fresh,
      current_record_count:current,
      aging_record_count:aging,
      stale_record_count:stale,
      latest_sale_date:latest,
      source_quality:original>0 ? "mixed-or-verified" : secondary>0 ? "secondary-source-only" : "none"
    };
  };

  api.validate=function(row={}){
    const errors=[];
    if(!["high","medium","low","none"].includes(row.sample_size_confidence)){
      errors.push("invalid sample-size band");
    }
    if(!["fresh","current","aging","stale","unknown"].includes(row.recency_status)){
      errors.push("invalid recency band");
    }
    if(Number(row.original_verified_sale_count)>Number(row.sale_count)){
      errors.push("original verified sale count exceeds sale count");
    }
    if(row.price_spread_ratio!==null &&
       (!Number.isFinite(Number(row.price_spread_ratio)) || Number(row.price_spread_ratio)<1)){
      errors.push("invalid price spread ratio");
    }
    return {valid:errors.length===0,errors};
  };

  root.BreakMetricMarketRecordQuality=Object.freeze(api);
})(typeof window!=="undefined" ? window : globalThis);
