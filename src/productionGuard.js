// BreakMetric production runtime guard v1.
(function(root){
  "use strict";
  const api={},events=[];let installed=false,online=root.navigator?.onLine!==false;
  const push=(type,message)=>{events.push({at:new Date().toISOString(),type,message:String(message||"").slice(0,300)});if(events.length>30)events.shift();};
  api.install=function({onFatal=null,onConnectivity=null}={}){
    if(installed)return false;installed=true;
    if(typeof root.addEventListener!=="function")return true;
    root.addEventListener("error",event=>{push("runtime-error",event?.error?.message||event?.message||"Unhandled runtime error");if(typeof onFatal==="function")onFatal("runtime-error");});
    root.addEventListener("unhandledrejection",event=>{push("unhandled-rejection",event?.reason?.message||event?.reason||"Unhandled promise rejection");if(typeof onFatal==="function")onFatal("unhandled-rejection");});
    root.addEventListener("offline",()=>{online=false;push("offline","Network connection lost");if(typeof onConnectivity==="function")onConnectivity(false);});
    root.addEventListener("online",()=>{online=true;push("online","Network connection restored");if(typeof onConnectivity==="function")onConnectivity(true);});
    return true;
  };
  api.online=()=>online;
  api.events=()=>events.map(x=>({...x}));
  api.installed=()=>installed;
  root.BreakMetricProductionGuard=Object.freeze(api);
})(typeof window!=="undefined"?window:globalThis);
