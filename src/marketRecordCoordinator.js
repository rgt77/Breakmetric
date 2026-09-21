// BreakMetric market-record load coordinator v1.
// Prevents stale lazy market-record loads from updating a newer product/format/team context.
(function(root){
  "use strict";

  const api={};

  function normalize(context={}){
    return {
      product_id:String(context.productId||context.product_id||""),
      format_id:String(context.formatId||context.format_id||""),
      team:String(context.team||"")
    };
  }

  function same(a,b){
    return Boolean(a&&b) &&
      a.product_id===b.product_id &&
      a.format_id===b.format_id &&
      a.team===b.team;
  }

  api.create=function(){
    let epoch=0;
    let active=null;

    return Object.freeze({
      begin(context){
        active={
          id:++epoch,
          context:normalize(context)
        };
        return Object.freeze({
          id:active.id,
          context:Object.freeze({...active.context})
        });
      },

      isCurrent(operation,currentContext){
        if(!operation || !active) return false;
        if(operation.id!==active.id) return false;
        if(!same(operation.context,active.context)) return false;
        return same(operation.context,normalize(currentContext));
      },

      invalidate(){
        epoch++;
        active=null;
      },

      snapshot(){
        return active
          ? {id:active.id,context:{...active.context}}
          : null;
      }
    });
  };

  root.BreakMetricMarketRecordCoordinator=Object.freeze(api);
})(typeof window!=="undefined" ? window : globalThis);
