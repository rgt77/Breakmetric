// BreakMetric canonical spot-currency helpers v1.
// Prevents cumulative rounding drift by keeping an unrounded USD reference amount.
(function(root){
  "use strict";

  const api={};

  function finiteNonNegative(value){
    const n=Number(value);
    return Number.isFinite(n) && n>=0 ? n : null;
  }

  api.normalizeSavedState=function(state={}){
    const amount=finiteNonNegative(state.amount);
    const currency=typeof state.currency==="string" && state.currency ? state.currency : null;
    const usdAmount=finiteNonNegative(state.usd_amount);
    if(amount===null || !currency) return null;
    return {
      schema_version:Number(state.schema_version)===2 ? 2 : 1,
      amount,
      currency,
      usd_amount:usdAmount
    };
  };

  api.canonicalUsdFromDisplay=function(amount,currency,usdToCurrencyRate){
    const value=finiteNonNegative(amount);
    if(value===null) return null;
    if(currency==="USD") return value;
    const rate=Number(usdToCurrencyRate);
    if(!Number.isFinite(rate) || rate<=0) return null;
    return value/rate;
  };

  api.displayFromCanonicalUsd=function(usdAmount,currency,usdToCurrencyRate){
    const value=finiteNonNegative(usdAmount);
    if(value===null) return null;
    if(currency==="USD") return value;
    const rate=Number(usdToCurrencyRate);
    if(!Number.isFinite(rate) || rate<=0) return null;
    return value*rate;
  };

  api.directRateFromUsdRates=function(usdToFrom,usdToTarget){
    const from=Number(usdToFrom);
    const target=Number(usdToTarget);
    if(!Number.isFinite(from) || from<=0 || !Number.isFinite(target) || target<=0){
      return null;
    }
    return target/from;
  };

  api.persistedState=function(amount,currency,usdAmount){
    const display=finiteNonNegative(amount);
    if(display===null || typeof currency!=="string" || !currency) return null;
    const canonical=finiteNonNegative(usdAmount);
    return {
      schema_version:2,
      amount:display,
      currency,
      usd_amount:canonical
    };
  };

  api.canPresentUsdValue=function(currency,rateReady){
    return currency==="USD" || rateReady===true;
  };

  api.conversionPlan=function({
    displayAmount=null,
    fromCurrency="USD",
    toCurrency="USD",
    canonicalUsd=null,
    usdToFrom=1,
    usdToTarget=1
  }={}){
    const hasDisplay=
      displayAmount!==null &&
      displayAmount!==undefined &&
      displayAmount!=="";
    const amount=hasDisplay ? finiteNonNegative(displayAmount) : null;
    if(hasDisplay && amount===null) return null;

    const canonical=
      !hasDisplay
        ? null
        : finiteNonNegative(canonicalUsd) ??
          api.canonicalUsdFromDisplay(amount,fromCurrency,usdToFrom);

    if(hasDisplay && canonical===null) return null;

    const direct=api.directRateFromUsdRates(usdToFrom,usdToTarget);
    if(direct===null) return null;

    const display=
      canonical===null
        ? null
        : api.displayFromCanonicalUsd(canonical,toCurrency,usdToTarget);

    if(canonical!==null && display===null) return null;

    return {
      canonical_usd:canonical,
      display_amount:display,
      direct_rate:direct
    };
  };

  api.clearedState=function(currency="USD"){
    return {
      canonical_usd:null,
      persisted_state:null,
      currency
    };
  };

  root.BreakMetricSpotCurrency=Object.freeze(api);
})(typeof window!=="undefined" ? window : globalThis);
