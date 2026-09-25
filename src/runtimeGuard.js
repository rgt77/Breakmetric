// BreakMetric runtime dependency guard v1.
(function(root){
  "use strict";

  const api={};

  api.check=function(requiredNames=[]){
    const names=[...new Set(
      (requiredNames||[])
        .map(value=>String(value||"").trim())
        .filter(Boolean)
    )];
    const missing=names.filter(name=>root[name]===undefined || root[name]===null);
    return {
      valid:missing.length===0,
      required_count:names.length,
      available_count:names.length-missing.length,
      missing
    };
  };

  api.message=function(report={}){
    const missing=Array.isArray(report.missing)?report.missing:[];
    return missing.length
      ? "Required application modules failed to load: "+missing.join(", ")
      : "Runtime dependencies ready.";
  };

  api.assert=function(requiredNames=[]){const report=api.check(requiredNames);if(!report.valid){const error=new Error(api.message(report));error.name="RuntimeDependencyError";error.missing=report.missing;throw error;}return report;};\n\n  root.BreakMetricRuntimeGuard=Object.freeze(api);
})(typeof window!=="undefined" ? window : globalThis);
