import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const marketDir=path.join(root,"data/market/2026-topps-chrome-premier-league");
const files=fs.readdirSync(marketDir)
  .filter(name=>name.endsWith(".json"))
  .map(name=>"data/market/2026-topps-chrome-premier-league/"+name);

const failures=[];
const warnings=[];

const median=values=>{
  const sorted=[...values].sort((a,b)=>a-b);
  if(!sorted.length) return null;
  const mid=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;
};
const validDate=value=>typeof value==="string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(new Date(value+"T00:00:00Z").getTime());

let recordCount=0;
let saleCount=0;
for(const file of files){
  const record=JSON.parse(fs.readFileSync(path.join(root,file),"utf8"));
  if(record.schema_version!==2 || !Array.isArray(record.sales)) continue;
  recordCount++;
  const prices=[];
  let original=0,secondary=0,discovery=0;
  const seen=new Set();

  for(const [index,sale] of record.sales.entries()){
    const prefix=file+" sale "+index;
    if(!validDate(sale.sale_date)) failures.push(prefix+" invalid date");
    if(!Number.isFinite(Number(sale.sale_price)) || Number(sale.sale_price)<=0){
      failures.push(prefix+" invalid price");
    }else{
      prices.push(Number(sale.sale_price));
    }
    if("verified" in sale || "verified_as_realized_sale" in sale){
      failures.push(prefix+" contains legacy verification flag");
    }
    if(sale.original_marketplace_verified===true){
      original++;
      const directUrl=
        sale.direct_marketplace_url ||
        sale.original_marketplace_url ||
        null;
      const stableSaleId=
        sale.source_sale_id ||
        sale.marketplace_sale_id ||
        sale.listing_id ||
        null;
      const hasOriginalLocator=
        (typeof directUrl==="string" && /^https?:\/\//i.test(directUrl)) ||
        (typeof stableSaleId==="string" && stableSaleId.trim().length>0);
      if(
        sale.direct_marketplace_url_recovered!==true &&
        !hasOriginalLocator
      ){
        failures.push(prefix+" original verification lacks recovered original locator");
      }
      if(!hasOriginalLocator){
        failures.push(prefix+" original verification lacks direct URL or stable sale id");
      }
      if(sale.evidence_status!=="original-marketplace-verified") failures.push(prefix+" original verification status mismatch");
    }else if(sale.evidence_status==="secondary-source-realized-sale"){
      secondary++;
      if(!sale.discovery_source || !sale.marketplace || !sale.source_reference){
        failures.push(prefix+" incomplete secondary-source evidence");
      }
    }else if(sale.evidence_status==="discovery-only"){
      discovery++;
    }else{
      failures.push(prefix+" invalid evidence status");
    }

    const duplicateKey=[
      sale.marketplace||"",
      sale.sale_date||"",
      Number(sale.sale_price),
      sale.serial_copy||"",
      sale.source_sale_id||sale.listing_id||""
    ].join("|");
    if(seen.has(duplicateKey)) warnings.push(prefix+" possible duplicate");
    seen.add(duplicateKey);
  }

  saleCount+=record.sales.length;
  const calc=record.calculated_market_value||{};
  if(Number(calc.sale_count)!==prices.length) failures.push(file+" calculated sale_count mismatch");
  const expected=median(prices);
  const stored=Number(calc.median_usd ?? calc.median_price);
  if(expected!==null && (!Number.isFinite(stored) || Math.abs(expected-stored)>0.011)){
    failures.push(file+" stored median mismatch");
  }

  const summary=record.evidence_summary||{};
  if(Number(summary.original_marketplace_verified_sale_count||0)!==original) failures.push(file+" original evidence count mismatch");
  if(Number(summary.secondary_source_realized_sale_count||0)!==secondary) failures.push(file+" secondary evidence count mismatch");
  if(Number(summary.discovery_only_sale_count||0)!==discovery) failures.push(file+" discovery evidence count mismatch");
  if(original===0 && secondary>0 && calc.status==="verified") failures.push(file+" secondary-only value marked verified");
}

console.log(JSON.stringify({
  result:failures.length?"fail":"pass",
  record_count:recordCount,
  sale_count:saleCount,
  warning_count:warnings.length,
  failed_count:failures.length,
  failures,
  warnings
},null,2));
if(failures.length) process.exit(1);
