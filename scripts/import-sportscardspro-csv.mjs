import fs from "node:fs";
import path from "node:path";
import {
  csvPriceUsd,
  exactProviderIdentity,
  mergeObservation,
  parseCsv
} from "./lib/market-automation.mjs";

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
const queue=readJson(config.queue_file);
const store=readJson(config.observation_file);
const urlEnv=config.bulk_lane?.csv_url_env||"SPORTSCARDSPRO_CSV_URL";
const csvUrl=process.env[urlEnv]||"";

let csvText="";
if(fixturePath){
  csvText=fs.readFileSync(path.resolve(root,fixturePath),"utf8");
}else if(csvUrl){
  const response=await fetch(csvUrl,{
    headers:{
      "accept":"text/csv,*/*;q=0.8",
      "user-agent":"BreakMetric-market-collector/1.0"
    }
  });
  if(!response.ok) throw new Error("CSV HTTP "+response.status);
  csvText=await response.text();
}else{
  console.log(JSON.stringify({
    result:"disabled-missing-csv-url",
    credential_env:urlEnv,
    message:"Daily bulk import is installed but requires the subscriber-specific CSV URL secret."
  },null,2));
  process.exit(0);
}

const rows=parseCsv(csvText);
if(!rows.length) throw new Error("CSV contained no data rows");

let updated=0,unchanged=0,ambiguous=0;
const results=[];
for(const task of queue.tasks||[]){
  const matches=[];
  for(const row of rows){
    const identity=exactProviderIdentity(task,row);
    if(identity.exact) matches.push({row,identity});
  }

  if(matches.length!==1){
    if(matches.length>1) ambiguous++;
    results.push({
      task_id:task.task_id,
      status:matches.length?"ambiguous-exact-match":"no-exact-match"
    });
    continue;
  }

  const row=matches[0].row;
  const price=csvPriceUsd(row);
  const previous=store.entries?.[task.task_id]||null;
  const productId=String(row.id||"");
  const semanticallySame=
    previous?.exact_identity===true &&
    previous?.status==="exact-current-price" &&
    Number(previous?.raw_price_usd)===Number(price) &&
    String(previous?.provider_product_id||"")===productId;

  if(semanticallySame){
    unchanged++;
    continue;
  }

  const observation={
    source:"sportscardspro-csv",
    status:price!==null?"exact-current-price":"exact-match-no-current-price",
    provider_product_id:productId,
    exact_identity:true,
    raw_price_usd:price,
    sales_volume_yearly:
      Number.isFinite(Number(row["sales-volume"]))
        ? Number(row["sales-volume"])
        : null,
    query:null,
    provider_product_name:String(row["product-name"]||""),
    provider_set_name:String(row["console-name"]||""),
    identity_reasons:[]
  };

  const merged=mergeObservation(
    store,task,observation,now.toISOString()
  );
  if(merged.changed) updated++; else unchanged++;
}

if(updated>0){
  store.generated_at=now.toISOString();
  fs.writeFileSync(path.join(root,config.observation_file),stable(store));
}

console.log(JSON.stringify({
  result:"pass",
  row_count:rows.length,
  queue_task_count:(queue.tasks||[]).length,
  updated_observation_count:updated,
  unchanged_observation_count:unchanged,
  ambiguous_match_count:ambiguous,
  result_sample:results.slice(0,20)
},null,2));
