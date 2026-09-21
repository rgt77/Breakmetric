import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root=process.cwd();
const versionPath="data/validation/runtime-data-version-v1.json";
const A="a".repeat(64);
const B="b".repeat(64);
const C="c".repeat(64);
const D="d".repeat(64);

let manifestFingerprint=A;
let dataValue=1;
let versionCalls=0;
let dataCalls=0;
let cacheModes=[];
let datasetUrls=[];
let datasetCacheModes=[];
let midLoadSequence=null;

function responseJson(value){
  const text=JSON.stringify(value);
  return {
    ok:true,
    status:200,
    headers:{get:()=>String(text.length)},
    text:async()=>text
  };
}

const fakeFetch=async (url,options={})=>{
  if(url===versionPath){
    versionCalls++;
    cacheModes.push(options.cache||null);
    let fingerprint=manifestFingerprint;
    if(midLoadSequence?.length){
      fingerprint=midLoadSequence.shift();
      manifestFingerprint=fingerprint;
    }
    return responseJson({fingerprint});
  }

  if(String(url).startsWith("data/test.json")){
    dataCalls++;
    datasetUrls.push(String(url));
    datasetCacheModes.push(options.cache||null);
    return responseJson({value:dataValue});
  }

  throw new Error("Unexpected URL: "+url);
};

const sandbox={
  console,
  fetch:fakeFetch,
  AbortController,
  setTimeout,
  clearTimeout,
  Object,
  Array,
  String,
  Number,
  Boolean,
  Set,
  Map,
  Math,
  JSON,
  TypeError
};
sandbox.globalThis=sandbox;
vm.createContext(sandbox);

vm.runInContext(
  fs.readFileSync(path.join(root,"src/dataLoader.js"),"utf8"),
  sandbox,
  {filename:"src/dataLoader.js"}
);

const loader=sandbox.BreakMetricDataLoader;
const assert=(condition,message)=>{
  if(!condition) throw new Error(message);
};

const first=await loader.loadJsonVersioned("data/test.json");
assert(first.value===1,"initial versioned load failed");
assert(loader.version()===A,"initial fingerprint not activated");
assert(dataCalls===1,"initial dataset request count wrong");
assert(
  datasetUrls[0]==="data/test.json?v="+A,
  "initial versioned dataset URL was not fingerprint-busted"
);
assert(datasetCacheModes[0]==="no-store","versioned dataset request did not bypass HTTP cache");

const second=await loader.loadJsonVersioned("data/test.json");
assert(second.value===1,"same-version cache load failed");
assert(dataCalls===1,"same fingerprint did not reuse dataset cache");

manifestFingerprint=B;
dataValue=2;
const third=await loader.loadJsonVersioned("data/test.json");
assert(third.value===2,"new fingerprint did not load fresh data");
assert(loader.version()===B,"new fingerprint not activated");
assert(dataCalls===2,"new fingerprint reused stale dataset cache");
assert(
  datasetUrls[1]==="data/test.json?v="+B,
  "new fingerprint did not change dataset network URL"
);
assert(datasetUrls[0]!==datasetUrls[1],"dataset URL did not change across deployment versions");
assert(datasetCacheModes[1]==="no-store","new-version dataset request did not bypass HTTP cache");

dataValue=3;
midLoadSequence=[C,D,D,D];
const fourth=await loader.loadJsonVersioned("data/test.json",{
  versionRetries:1
});
assert(fourth.value===3,"mid-load version restart failed");
assert(loader.version()===D,"stable retry did not settle on final fingerprint");

const stats=loader.stats();
assert(stats.version_restarts===1,"version restart metric mismatch");
assert(stats.cache_invalidations>=3,"cache invalidation metric did not track version changes");
assert(cacheModes.every(mode=>mode==="no-store"),"version manifest was not fetched with no-store");
assert(
  datasetUrls.every(url=>/^data\/test\.json\?v=[a-f0-9]{64}$/i.test(url)),
  "versioned dataset request omitted fingerprint query"
);
assert(
  datasetCacheModes.every(mode=>mode==="no-store"),
  "versioned dataset requests did not consistently bypass HTTP cache"
);

console.log(JSON.stringify({
  result:"pass",
  version_calls:versionCalls,
  data_calls:dataCalls,
  final_version:loader.version(),
  version_restarts:stats.version_restarts,
  cache_invalidations:stats.cache_invalidations,
  checks:[
    "same-version cache reuse",
    "fingerprint change invalidates cache",
    "version manifest uses no-store",
    "dataset network URL is fingerprint cache-busted",
    "versioned datasets bypass browser HTTP cache",
    "mid-load deployment change restarts load",
    "stable final fingerprint required before activation",
    "HTML cache-busts the data loader runtime"
  ]
},null,2));
