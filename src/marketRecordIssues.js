// BreakMetric market-record issue detector v1.
(function(root){
  "use strict";
  const api={};
  const allowedEvidence=new Set([
    "original-marketplace-verified",
    "secondary-source-realized-sale",
    "discovery-only"
  ]);

  function finitePositive(value){
    return Number.isFinite(Number(value)) && Number(value)>0;
  }

  function validDate(value){
    if(typeof value!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    return !Number.isNaN(new Date(value+"T00:00:00Z").getTime());
  }

  function median(values){
    const sorted=[...values].sort((a,b)=>a-b);
    if(!sorted.length) return null;
    const mid=Math.floor(sorted.length/2);
    return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;
  }

  api.audit=function(record={},now=new Date()){
    const errors=[],warnings=[];
    const sales=Array.isArray(record.sales)?record.sales:null;
    if(record.schema_version!==2) errors.push("schema_version must be 2");
    if(!sales){
      errors.push("sales must be an array");
      return {valid:false,errors,warnings};
    }
    if(record.currency && record.currency!=="USD") warnings.push("record currency is not USD");

    let original=0,secondary=0,discovery=0;
    const prices=[];
    for(const [index,sale] of sales.entries()){
      if(!validDate(sale.sale_date)) errors.push("sale "+index+" has invalid date");
      else if(new Date(sale.sale_date+"T00:00:00Z")>now) errors.push("sale "+index+" is dated in the future");
      if(!finitePositive(sale.sale_price)) errors.push("sale "+index+" has invalid price");
      else prices.push(Number(sale.sale_price));
      if(!allowedEvidence.has(sale.evidence_status)) errors.push("sale "+index+" has invalid evidence_status");
      if("verified" in sale || "verified_as_realized_sale" in sale){
        errors.push("sale "+index+" contains legacy verification flag");
      }
      if(sale.original_marketplace_verified===true){
        original++;
        if(sale.direct_marketplace_url_recovered!==true){
          errors.push("sale "+index+" original verification lacks recovered URL");
        }
        if(sale.evidence_status!=="original-marketplace-verified"){
          errors.push("sale "+index+" original verification status mismatch");
        }
      }else if(sale.evidence_status==="secondary-source-realized-sale"){
        secondary++;
        if(!sale.discovery_source) errors.push("sale "+index+" secondary evidence lacks discovery source");
        if(!sale.marketplace) errors.push("sale "+index+" secondary evidence lacks marketplace");
        if(!sale.source_reference) errors.push("sale "+index+" secondary evidence lacks source reference");
      }else if(sale.evidence_status==="discovery-only"){
        discovery++;
      }
    }

    const calc=record.calculated_market_value||{};
    if(Number(calc.sale_count)!==prices.length){
      errors.push("calculated sale_count does not match valid sales");
    }
    const expectedMedian=median(prices);
    const storedMedian=Number(calc.median_usd ?? calc.median_price);
    if(expectedMedian!==null &&
       (!Number.isFinite(storedMedian) || Math.abs(expectedMedian-storedMedian)>0.011)){
      errors.push("calculated median does not match stored sales");
    }

    const summary=record.evidence_summary||{};
    if(Number(summary.original_marketplace_verified_sale_count||0)!==original){
      errors.push("evidence summary original count mismatch");
    }
    if(Number(summary.secondary_source_realized_sale_count||0)!==secondary){
      errors.push("evidence summary secondary count mismatch");
    }
    if(Number(summary.discovery_only_sale_count||0)!==discovery){
      errors.push("evidence summary discovery count mismatch");
    }
    if(original===0 && secondary>0 && calc.status==="verified"){
      errors.push("secondary-only market value cannot be verified");
    }

    const seen=new Set();
    for(const [index,sale] of sales.entries()){
      const key=[
        sale.marketplace||"",
        sale.sale_date||"",
        Number(sale.sale_price),
        sale.serial_copy||"",
        sale.source_sale_id||sale.listing_id||""
      ].join("|");
      if(seen.has(key)) warnings.push("possible duplicate sale at index "+index);
      seen.add(key);
    }

    return {
      valid:errors.length===0,
      errors,
      warnings,
      metrics:{
        sale_count:sales.length,
        original_verified_sale_count:original,
        secondary_source_sale_count:secondary,
        discovery_only_sale_count:discovery
      }
    };
  };

  api.aggregate=function(results=[]){
    return {
      record_count:results.length,
      invalid_record_count:results.filter(x=>!x.valid).length,
      error_count:results.reduce((sum,x)=>sum+(x.errors||[]).length,0),
      warning_count:results.reduce((sum,x)=>sum+(x.warnings||[]).length,0)
    };
  };

  root.BreakMetricMarketRecordIssues=Object.freeze(api);
})(typeof window!=="undefined" ? window : globalThis);
