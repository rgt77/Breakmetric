import fs from "node:fs";import path from "node:path";
export const defaultRegistryPath="data/releases/index.json";
export const readJson=(root,file)=>JSON.parse(fs.readFileSync(path.join(root,file),"utf8"));
export function loadRegistry(root=process.cwd(),file=defaultRegistryPath){const registry=readJson(root,file);if(registry.model!=="release-registry-v1"||!Array.isArray(registry.releases))throw new Error("Invalid release registry");return registry;}
export function releaseById(registry,id){return registry.releases.find(x=>x.id===id)||null;}
export function resolveRelease(registry,id=null){const release=releaseById(registry,id||registry.default_release_id);if(!release)throw new Error("Unknown release: "+String(id));return release;}
export function formatsFor(root,release){return readJson(root,release.formats_file).formats||[];}
export function formatById(root,release,id){return formatsFor(root,release).find(x=>x.id===id)||null;}
export function collectorConfigFor(release,formatId){return release.collector_configs?.[formatId]||null;}
