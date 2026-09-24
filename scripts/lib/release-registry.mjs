import fs from "node:fs";import path from "node:path";
export const defaultRegistryPath="data/releases/index.json";
export const readJson=(root,file)=>JSON.parse(fs.readFileSync(path.join(root,file),"utf8"));
export function loadRegistry(root=process.cwd(),file=defaultRegistryPath){const registry=readJson(root,file);if(registry.model!=="release-registry-v1"||!Array.isArray(registry.releases))throw new Error("Invalid release registry");return registry;}
export function releaseById(registry,id){return registry.releases.find(x=>x.id===id)||null;}
export function resolveRelease(registry,id=null){const release=releaseById(registry,id||registry.default_release_id);if(!release)throw new Error("Unknown release: "+String(id));return release;}
export function formatsFor(root,release){return readJson(root,release.formats_file).formats||[];}
export function formatById(root,release,id){return formatsFor(root,release).find(x=>x.id===id)||null;}
export function collectorConfigFor(release,formatId){return release.collector_configs?.[formatId]||null;}
export function readyFormats(root,release){return formatsFor(root,release).filter(x=>x.status==="ready");}
export function releaseOptions(registry){return registry.releases.map(({id,name,sport,manufacturer,year,status})=>({id,name,sport,manufacturer,year,status}));}
export function formatOptions(root,release){return formatsFor(root,release).map(({id,name,status,analysis_unit})=>({id,name,status,analysis_unit:analysis_unit||null}));}
export function analysisDataFor(root,release,formatId){const f=formatById(root,release,formatId);return f?.analysis_data||null;}
export function assertReadyFormat(root,release,formatId){const f=formatById(root,release,formatId);if(!f)throw new Error("Unknown format: "+formatId);if(f.status!=="ready")throw new Error("Format not analysis-ready: "+formatId);return f;}
export const releaseKey=(releaseId,formatId)=>releaseId+"::"+formatId;
export function allReadyTargets(root,registry){return registry.releases.flatMap(r=>readyFormats(root,r).map(f=>({release:r,format:f,collector_config:collectorConfigFor(r,f.id)})));}
export function assertCollectorConfig(release,formatId){const p=collectorConfigFor(release,formatId);if(!p)throw new Error("Missing collector config: "+releaseKey(release.id,formatId));return p;}
export function releaseByCollectorConfig(registry,file){return registry.releases.find(r=>Object.values(r.collector_configs||{}).includes(file))||null;}
