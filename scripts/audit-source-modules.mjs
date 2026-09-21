import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const read=file=>fs.readFileSync(path.join(root,file),"utf8");
const readJson=file=>JSON.parse(read(file));
const fail=[];
const inventory=readJson("data/validation/source-module-inventory-v1.json");

const actual=fs.readdirSync(path.join(root,"src"))
  .filter(name=>name.endsWith(".js"))
  .sort();

const roleEntries=Object.entries(inventory.roles||{});
const classified=roleEntries.flatMap(([,role])=>role.files||[]);
const counts=new Map();
for(const file of classified) counts.set(file,(counts.get(file)||0)+1);

for(const file of actual){
  if(!counts.has(file)) fail.push("unclassified source module: "+file);
  if((counts.get(file)||0)!==1) fail.push("source module must be classified exactly once: "+file);
}
for(const file of classified){
  if(!actual.includes(file)) fail.push("classified source module missing from src/: "+file);
}
if(classified.length!==actual.length){
  fail.push("classified source-module count does not match src directory");
}

const html=read("index.html");
const runtime=[...html.matchAll(/<script\s+src="src\/([^"]+\.js)"/g)]
  .map(match=>match[1])
  .sort();
const expectedRuntime=[...(inventory.roles?.runtime?.files||[])].sort();

if(JSON.stringify(runtime)!==JSON.stringify(expectedRuntime)){
  fail.push("runtime inventory does not exactly match index.html script modules");
}

const runtimeSet=new Set(runtime);
for(const file of inventory.roles?.ci_generator?.files||[]){
  if(runtimeSet.has(file)) fail.push("CI generator unexpectedly loaded at runtime: "+file);
}
for(const file of inventory.roles?.offline_model_library?.files||[]){
  if(runtimeSet.has(file)) fail.push("offline model unexpectedly loaded at runtime: "+file);
}

const validationCorpus=[
  "scripts/validate-player-derivation.mjs",
  "scripts/validate.mjs",
  "scripts/smoke-models.mjs",
  "data/derived/2026-topps-chrome-premier-league-hobby-player-derivation-manifest-v1.json"
]
  .filter(file=>fs.existsSync(path.join(root,file)))
  .map(read)
  .join("\n");

for(const file of inventory.roles?.ci_generator?.files||[]){
  if(!validationCorpus.includes(file)){
    fail.push("CI generator has no validation/manifest reference: "+file);
  }
}

const offline=[...(inventory.roles?.offline_model_library?.files||[])].sort();
const grouped=Object.values(inventory.domain_groups||{}).flat().sort();
if(JSON.stringify(offline)!==JSON.stringify(grouped)){
  fail.push("offline model domain groups do not exactly cover offline-model-library modules");
}

const summary=inventory.summary||{};
if(Number(summary.source_module_count)!==actual.length){
  fail.push("source_module_count summary mismatch");
}
if(Number(summary.runtime_module_count)!==expectedRuntime.length){
  fail.push("runtime_module_count summary mismatch");
}
if(Number(summary.ci_generator_count)!==(inventory.roles?.ci_generator?.files||[]).length){
  fail.push("ci_generator_count summary mismatch");
}
if(Number(summary.offline_model_library_count)!==offline.length){
  fail.push("offline_model_library_count summary mismatch");
}
if(Number(summary.unclassified_count)!==0){
  fail.push("inventory summary must report zero unclassified modules");
}

console.log(JSON.stringify({
  result:fail.length?"fail":"pass",
  source_module_count:actual.length,
  runtime_module_count:runtime.length,
  ci_generator_count:(inventory.roles?.ci_generator?.files||[]).length,
  offline_model_library_count:offline.length,
  unclassified_count:actual.filter(file=>!counts.has(file)).length,
  failures:fail
},null,2));

if(fail.length) process.exit(1);
