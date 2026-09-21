import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root=process.cwd();
const target="data/validation/runtime-data-version-v1.json";
const check=process.argv.includes("--check");

function walk(dir){
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
    const full=path.join(dir,entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function gitBlobSha(file){
  const content=fs.readFileSync(file);
  const header=Buffer.from(`blob ${content.length}\0`);
  return crypto
    .createHash("sha1")
    .update(header)
    .update(content)
    .digest("hex");
}

const rows=walk(path.join(root,"data"))
  .filter(file=>file.endsWith(".json"))
  .map(file=>path.relative(root,file).replaceAll(path.sep,"/"))
  .filter(file=>file!==target)
  .sort()
  .map(file=>file+"\0"+gitBlobSha(path.join(root,file)));

const fingerprint=crypto
  .createHash("sha256")
  .update(rows.join("\n"),"utf8")
  .digest("hex");

const manifest={
  schema_version:1,
  model:"runtime-data-version-v1",
  algorithm:"sha256(sorted path + NUL + git-blob-sha1)",
  file_count:rows.length,
  fingerprint,
  excluded:[target]
};

const expected=JSON.stringify(manifest,null,2)+"\n";

if(check){
  const current=fs.existsSync(path.join(root,target))
    ? fs.readFileSync(path.join(root,target),"utf8")
    : "";
  if(current!==expected){
    console.error(JSON.stringify({
      result:"fail",
      reason:"runtime data version manifest is stale",
      expected:manifest
    },null,2));
    process.exit(1);
  }
  console.log(JSON.stringify({result:"pass",...manifest},null,2));
}else{
  fs.mkdirSync(path.dirname(path.join(root,target)),{recursive:true});
  fs.writeFileSync(path.join(root,target),expected);
  console.log(JSON.stringify({result:"written",...manifest},null,2));
}
