// BreakMetric product-selection coordinator v1.
// Prevents stale async selection chains from continuing after a newer product choice.
(function(root){
  "use strict";

  const api={};

  api.create=function(){
    let epoch=0;
    let active=null;

    return Object.freeze({
      begin(productId){
        active={
          id:++epoch,
          product_id:String(productId||"")
        };
        return Object.freeze({...active});
      },

      isCurrent(operation,currentProductId=null){
        if(!operation || !active) return false;
        if(operation.id!==active.id) return false;
        if(operation.product_id!==active.product_id) return false;
        return currentProductId===null ||
          String(currentProductId)===operation.product_id;
      },

      invalidate(){
        epoch++;
        active=null;
      },

      snapshot(){
        return active ? {...active} : null;
      }
    });
  };

  root.BreakMetricSelectionCoordinator=Object.freeze(api);
})(typeof window!=="undefined" ? window : globalThis);
