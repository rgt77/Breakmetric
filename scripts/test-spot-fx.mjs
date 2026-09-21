import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root=process.cwd();
const memory=new Map();
const localStorage={
  getItem:key=>memory.has(String(key))?memory.get(String(key)):null,
  setItem:(key,value)=>memory.set(String(key),String(value)),
  removeItem:key=>memory.delete(String(key))
};
const sandbox={
  console,
  Number,
  String,
  Boolean,
  Object,
  Array,
  Math,
  JSON,
  Map,
  Set,
  Promise,
  Date,
  setTimeout,
  clearTimeout,
  AbortController,
  localStorage
};
sandbox.globalThis=sandbox;
vm.createContext(sandbox);

for(const file of ["src/storage.js","src/spotCurrency.js","src/fxRate.js"]){
  vm.runInContext(
    fs.readFileSync(path.join(root,file),"utf8"),
    sandbox,
    {filename:file}
  );
}

const assert=(condition,message)=>{
  if(!condition) throw new Error(message);
};

const spot=sandbox.BreakMetricSpotCurrency;
const storage=sandbox.BreakMetricStorage;
const fx=sandbox.BreakMetricFxRate;

assert(storage.mode()==="persistent","persistent storage probe failed");

const usd=50;
const sekRate=10;
const eurRate=0.9;
const gbpRate=0.8;

const toEur=spot.conversionPlan({
  displayAmount:500,
  fromCurrency:"SEK",
  toCurrency:"EUR",
  canonicalUsd:usd,
  usdToFrom:sekRate,
  usdToTarget:eurRate
});
assert(Math.abs(toEur.canonical_usd-usd)<1e-12,"SEK→EUR changed canonical USD");
assert(Math.abs(toEur.display_amount-45)<1e-12,"SEK→EUR display amount wrong");

const toGbp=spot.conversionPlan({
  displayAmount:Number(toEur.display_amount.toFixed(2)),
  fromCurrency:"EUR",
  toCurrency:"GBP",
  canonicalUsd:toEur.canonical_usd,
  usdToFrom:eurRate,
  usdToTarget:gbpRate
});
assert(Math.abs(toGbp.canonical_usd-usd)<1e-12,"EUR→GBP drifted canonical USD");
assert(Math.abs(toGbp.display_amount-40)<1e-12,"EUR→GBP display amount wrong");

const backUsd=spot.conversionPlan({
  displayAmount:Number(toGbp.display_amount.toFixed(2)),
  fromCurrency:"GBP",
  toCurrency:"USD",
  canonicalUsd:toGbp.canonical_usd,
  usdToFrom:gbpRate,
  usdToTarget:1
});
assert(Math.abs(backUsd.canonical_usd-usd)<1e-12,"GBP→USD drifted canonical USD");
assert(Math.abs(backUsd.display_amount-usd)<1e-12,"GBP→USD did not restore USD amount");

const edited=spot.conversionPlan({
  displayAmount:1000,
  fromCurrency:"SEK",
  toCurrency:"SEK",
  canonicalUsd:null,
  usdToFrom:sekRate,
  usdToTarget:sekRate
});
assert(Math.abs(edited.canonical_usd-100)<1e-12,"manual SEK edit did not replace canonical USD");

assert(spot.persistedState("", "SEK", usd)===null,"blank spot amount persisted as zero");
assert(spot.normalizeSavedState({amount:"",currency:"SEK",usd_amount:usd})===null,"blank saved amount normalized as zero");
const cleared=spot.clearedState("SEK");
assert(cleared.canonical_usd===null && cleared.persisted_state===null,"clear state retained canonical price");

storage.setJson("breakmetric_spot_state",spot.persistedState(500,"SEK",usd));
assert(storage.getJson("breakmetric_spot_state").usd_amount===usd,"canonical USD not persisted");
storage.remove("breakmetric_spot_state");
assert(storage.get("breakmetric_spot_state",null)===null,"spot state remove failed");

assert(spot.canPresentUsdValue("USD",false)===true,"USD incorrectly requires FX");
assert(spot.canPresentUsdValue("SEK",false)===false,"non-USD value allowed without FX");
assert(spot.canPresentUsdValue("SEK",true)===true,"non-USD value blocked with FX ready");

const success=await fx.fetchRate("USD","SEK",{
  fetchImpl:async()=>({
    ok:true,
    json:async()=>({rate:10.25,date:"2026-09-21"})
  }),
  timeoutMs:50,
  AbortControllerCtor:AbortController
});
assert(success.rate===10.25 && success.date==="2026-09-21","FX success path failed");

let invalidRejected=false;
try{
  await fx.fetchRate("USD","SEK",{
    fetchImpl:async()=>({ok:true,json:async()=>({rate:0})}),
    timeoutMs:50,
    AbortControllerCtor:AbortController
  });
}catch(_){
  invalidRejected=true;
}
assert(invalidRejected,"invalid FX rate was accepted");

let httpRejected=false;
try{
  await fx.fetchRate("USD","SEK",{
    fetchImpl:async()=>({ok:false,status:503,json:async()=>({})}),
    timeoutMs:50,
    AbortControllerCtor:AbortController
  });
}catch(error){
  httpRejected=error.status===503;
}
assert(httpRejected,"FX HTTP failure was not surfaced");

let timedOut=false;
try{
  await fx.fetchRate("USD","SEK",{
    fetchImpl:(_url,{signal}={})=>new Promise((_resolve,reject)=>{
      signal?.addEventListener("abort",()=>{
        const error=new Error("aborted");
        error.name="AbortError";
        reject(error);
      },{once:true});
    }),
    timeoutMs:10,
    AbortControllerCtor:AbortController
  });
}catch(error){
  timedOut=error.name==="AbortError";
}
assert(timedOut,"FX timeout did not abort request");

console.log(JSON.stringify({
  result:"pass",
  checks:[
    "canonical roundtrip",
    "manual edit canonicalization",
    "clear removes spot state",
    "blank amount rejection",
    "storage persistence/removal",
    "FX presentation gate",
    "FX success",
    "FX invalid-rate rejection",
    "FX HTTP failure",
    "FX timeout"
  ]
},null,2));
