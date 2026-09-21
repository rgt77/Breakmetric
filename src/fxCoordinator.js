// BreakMetric FX operation coordinator v1.
// Makes asynchronous FX transitions last-write-wins and prevents stale success/failure commits.
(function(root){
  "use strict";

  const api={};

  api.create=function(){
    let epoch=0;
    let active=null;

    return Object.freeze({
      begin(kind,targetCurrency){
        active={
          id:++epoch,
          kind:String(kind||"conversion"),
          target_currency:String(targetCurrency||"")
        };
        return Object.freeze({...active});
      },

      isCurrent(operation,currentCurrency=null){
        if(!operation || !active) return false;
        if(operation.id!==active.id) return false;
        if(operation.target_currency!==active.target_currency) return false;
        return currentCurrency===null ||
          String(currentCurrency)===operation.target_currency;
      },

      invalidate(){
        epoch++;
        active=null;
      },

      snapshot(){
        return active ? {...active} : null;
      },

      epoch(){
        return epoch;
      }
    });
  };

  root.BreakMetricFxCoordinator=Object.freeze(api);
})(typeof window!=="undefined" ? window : globalThis);
