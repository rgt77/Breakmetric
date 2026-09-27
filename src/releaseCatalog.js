// BreakMetric release catalog coordinator v2.
(function(root){"use strict";const api={};
api.load=async function(){const loader=root.BreakMetricDataLoader;if(!loader)throw new Error("Data loader unavailable");const [registry,products]=await Promise.all([loader.loadJson("data/releases/index.json"),loader.loadJson("data/products/catalog.json")]);const productMap=new Map((products.products||[]).map(p=>[p.id,p]));const releases=[];for(const r of registry.releases||[]){const p=productMap.get(r.id);if(!p)throw new Error("Release missing canonical product: "+r.id);if(r.formats_file!==p.format_data)throw new Error("Release/product format route mismatch: "+r.id);const formats=await loader.loadJson(p.format_data);if(formats.product_id!==p.id)throw new Error("Format catalog product mismatch: "+p.id);releases.push({...r,name:p.display_name||r.name,status:p.status,lifecycle_state:p.lifecycle_state,active:p.active===true,season:p.season,release_year:p.release_year,formats:(formats.formats||[]).map(x=>({id:x.id,name:x.name,status:x.status,analysis_unit:x.analysis_unit||null,analysis_data:x.analysis_data||null}))});}return {default_release_id:registry.default_release_id,releases};};
api.release=(catalog,id)=>catalog?.releases?.find(r=>r.id===id)||null;
api.readyFormats=release=>release?.formats?.filter(f=>f.status==="ready")||[];
api.canAnalyze=(release,formatId)=>Boolean(release?.status==="ready"&&["analysis-ready","active"].includes(release?.lifecycle_state)&&api.readyFormats(release).some(f=>f.id===formatId)&&release?.collector_configs?.[formatId]);
api.releaseOptions=catalog=>(catalog?.releases||[]).map(r=>({id:r.id,name:r.name,status:r.status,enabled:["analysis-ready","active"].includes(r.lifecycle_state)&&api.readyFormats(r).length>0}));
api.pendingReason=release=>!release||!["analysis-ready","active"].includes(release.lifecycle_state)?"Data package is still being verified.":null;
api.formatOptions=release=>(release?.formats||[]).map(f=>({id:f.id,name:f.name,status:f.status,enabled:api.canAnalyze(release,f.id)}));
api.defaultRelease=catalog=>api.release(catalog,catalog?.default_release_id)||catalog?.releases?.[0]||null;
api.selectionValid=(catalog,releaseId,formatId)=>{const r=api.release(catalog,releaseId);return Boolean(r&&api.canAnalyze(r,formatId));};
api.resetDownstream=state=>({...state,format_id:null,team:null,player:null,spot_price:null});
root.BreakMetricReleaseCatalog=Object.freeze(api);})(typeof window!=="undefined"?window:globalThis);
