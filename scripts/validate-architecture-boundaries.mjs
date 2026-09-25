import fs from "node:fs";
import path from "node:path";

const root=path.resolve(import.meta.dirname,"..");
const contractPath=path.join(root,"data/validation/architecture-boundaries-v1.json");
const contract=JSON.parse(fs.readFileSync(contractPath,"utf8"));
const errors=[];

if(contract.schema_version!==1) errors.push("architecture schema_version must be 1");
if(contract.model!=="architecture-boundaries-v1") errors.push("architecture model mismatch");
if(contract.phase!==5) errors.push("architecture phase must be 5");

const required=new Set();
for(const [boundary,definition] of Object.entries(contract.boundaries||{})){
  const modules=definition?.required_modules;
  if(!Array.isArray(modules) || modules.length===0){
    errors.push("boundary has no required modules: "+boundary);
    continue;
  }
  for(const file of modules){
    if(required.has(file)) errors.push("module classified in multiple architecture boundaries: "+file);
    required.add(file);
    if(!fs.existsSync(path.join(root,file))) errors.push("required architecture module missing: "+file);
  }
  if(!Array.isArray(definition?.rules) || definition.rules.length===0){
    errors.push("boundary has no rules: "+boundary);
  }
}

for(const [file,patterns] of Object.entries(contract.forbidden_patterns||{})){
  const full=path.join(root,file);
  if(!fs.existsSync(full)){
    errors.push("forbidden-pattern target missing: "+file);
    continue;
  }
  const source=fs.readFileSync(full,"utf8");
  for(const pattern of patterns||[]){
    if(source.includes(pattern)) errors.push("forbidden architecture pattern in "+file+": "+pattern);
  }
}

const index=fs.readFileSync(path.join(root,"index.html"),"utf8");
for(const file of required){
  if(!file.startsWith("src/")) continue;
  const name=file.slice("src/".length);
  // CI-only modules are deliberately not part of the Phase-5 runtime contract.
  if(name==="playerDerivation.js") continue;
  if(!index.includes("src/"+name)){
    errors.push("required runtime architecture module not loaded by index.html: "+file);
  }
}

if(errors.length){
  console.error("Architecture boundary validation failed:");
  for(const error of errors) console.error(" - "+error);
  process.exit(1);
}

console.log("Architecture boundary validation passed.");
console.log("Validated "+Object.keys(contract.boundaries).length+" boundaries and "+required.size+" required modules.");
