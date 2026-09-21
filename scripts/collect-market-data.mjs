import fs from "node:fs";
import path from "node:path";
import {
  buildSearchQuery,
  exactProviderIdentity,
  mergeObservation,
  selectRotatingBatch,
  apiPriceUsd
} from "./lib/market-automation.mjs";
import {buildUnvaluedCollectionTasks} from "./lib/ev-slot-inventory.mjs";

const root=process.cwd();
const args=process.argv.slice(2);
const valueAfter=flag=>{
  const i=args.indexOf(flag);
  return i>=0 ? args[i+1] : null;
};
const configPath=valueAfter("--config")||
  "data/collection/continuous-market-collector-config-v1.json";
const fixturePath=valueAfter("--fixture");
const nowArg=valueAfter("--now");
const now=nowArg ? new Date(nowArg) : new Date();
if(Number.isNaN(now.getTime())) throw new Error("Invalid --now timestamp");

const readJson=file=>JSON.parse(fs.readFileSync(path.join(root,file),"utf8"));
const stable=value=>JSON.stringify(value,null,2)+"\n";
const config=readJson(configPath);
const store=readJson(config.observation_file);
const sources=config.task_sources||{};
const taskState=buildUnvaluedCollectionTasks({
  product:config.product_id,
  inventory:readJson(sources.inventory),
  provenance:readJson(sources.provenance),
  baseOdds:readJson(sources.base_odds),
  insertMap:readJson(sources.insert_odds_mapping),
  autoMap:readJson(sources.autograph_odds_mapping),
  inserts:readJson(sources.insert_checklist),
  mainAutos:readJson(sources.main_autographs),
  specialAutos:readJson(sources.special_autographs),
  format:readJson(sources.format)
});
const cadence=Number(config.fast_lane?.cadence_minutes||15);
const batchSize=Number(valueAfter("--batch-size")||config.fast_lane?.batch_size||20);
const minDelay=Number(config.fast_lane?.min_request_interval_ms||1100);
const token=process.env[config.fast_lane?.credential_env||"SPORTSCARDSPRO_TOKEN"]||"";
const fixture=fixturePath ? readJson(fixturePath) : null;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

let lastRequestAt=0;
async function throttledJson(url){
  const elapsed=Date.now()-lastRequestAt;
  if(elapsed<minDelay) await sleep(minDelay-elapsed);
  const response=await fetch(url,{
    headers:{
      "accept":"application/json",
      "user-agent":"BreakMetric-market-collector/1.0"
    }
  });
  lastRequestAt=Date.now();
  if(!response.ok){
    throw new Error("Provider HTTP "+response.status);
  }
  const json=await response.json();
  if(json?.status==="error"){
    throw new Error("Provider error: "+String(json["error-message"]||"unknown"));
  }
  return json;
}

async function providerSearch(query){
  if(fixture){
    return fixture.search_by_query?.[query]||{status:"success",products:[]};
  }
  const url="https://www.sportscardspro.com/api/products?t="+
    encodeURIComponent(token)+"&q="+encodeURIComponent(query);
  return throttledJson(url);
}

async function providerProduct(id){
  if(fixture){
    return fixture.product_by_id?.[String(id)]||{status:"error","error-message":"fixture missing"};
  }
  const url="https://www.sportscardspro.com/api/product?t="+
    encodeURIComponent(token)+"&id="+encodeURIComponent(id);
  return throttledJson(url);
}

if(!fixture && !token){
  console.log(JSON.stringify({
    result:"disabled-missing-credential",
    credential_env:config.fast_lane?.credential_env||"SPORTSCARDSPRO_TOKEN",
    message:"Continuous collector is installed but live provider collection requires the configured GitHub Actions secret."
  },null,2));
  process.exit(0);
}

const tasks=(taskState.tasks||[]).filter(task=>task.status==="unvalued");
const selection=selectRotatingBatch(tasks,{
  nowMs:now.getTime(),
  cadenceMinutes:cadence,
  batchSize
});

let updated=0,unchanged=0,failed=0;
const results=[];
for(const task of selection.batch){
  const query=buildSearchQuery(task);
  try{
    const search=await providerSearch(query);
    const products=Array.isArray(search.products)?search.products:[];
    const assessed=products.map(product=>({
      product,
      identity:exactProviderIdentity(task,product)
    }));
    const exact=assessed.filter(row=>row.identity.exact);

    let observation;
    if(exact.length!==1){
      observation={
        source:"sportscardspro-api",
        status:exact.length===0?"no-exact-match":"ambiguous-exact-match",
        provider_product_id:null,
        exact_identity:false,
        raw_price_usd:null,
        sales_volume_yearly:null,
        query,
        provider_product_name:null,
        provider_set_name:null,
        identity_reasons:exact.length===0
          ? [...new Set(assessed.flatMap(row=>row.identity.reasons))].slice(0,20)
          : ["multiple-exact-provider-products"]
      };
    }else{
      const detail=await providerProduct(exact[0].product.id);
      const identity=exactProviderIdentity(task,detail);
      const price=identity.exact ? apiPriceUsd(detail) : null;
      observation={
        source:"sportscardspro-api",
        status:identity.exact && price!==null
          ? "exact-current-price"
          : identity.exact
            ? "exact-match-no-current-price"
            : "detail-identity-mismatch",
        provider_product_id:String(detail.id||exact[0].product.id||""),
        exact_identity:identity.exact,
        raw_price_usd:price,
        sales_volume_yearly:
          Number.isFinite(Number(detail["sales-volume"]))
            ? Number(detail["sales-volume"])
            : null,
        query,
        provider_product_name:String(detail["product-name"]||""),
        provider_set_name:String(detail["console-name"]||""),
        identity_reasons:identity.reasons
      };
    }

    const merged=mergeObservation(
      store,task,observation,now.toISOString()
    );
    if(merged.changed) updated++; else unchanged++;
    results.push({
      task_id:task.task_id,
      status:observation.status,
      changed:merged.changed,
      price_usd:observation.raw_price_usd
    });
  }catch(error){
    failed++;
    results.push({
      task_id:task.task_id,
      status:"provider-error",
      error:String(error?.message||error)
    });
  }
}

if(updated>0){
  store.generated_at=now.toISOString();
  fs.writeFileSync(
    path.join(root,config.observation_file),
    stable(store)
  );
}

console.log(JSON.stringify({
  result:failed===selection.batch.length&&selection.batch.length
    ? "provider-failure"
    : "pass",
  product_id:config.product_id,
  eligible_slot_count:taskState.eligible_slot_count,
  valued_slot_count:taskState.valued_slot_count,
  unvalued_slot_count:taskState.unvalued_slot_count,
  selected_task_count:selection.batch.length,
  shard_index:selection.shard_index,
  shard_count:selection.shard_count,
  updated_observation_count:updated,
  unchanged_observation_count:unchanged,
  failed_task_count:failed,
  results
},null,2));

if(failed===selection.batch.length && selection.batch.length) process.exit(2);
