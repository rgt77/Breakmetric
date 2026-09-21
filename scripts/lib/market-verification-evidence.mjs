import { assessListingIdentity } from "./market-card-identity.mjs";

const money=value=>Number(value);

function clone(value){
  return JSON.parse(JSON.stringify(value));
}

function validDate(value){
  return typeof value==="string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(new Date(value+"T00:00:00Z").getTime());
}

function text(value){
  return typeof value==="string" ? value.trim() : "";
}

function urlHost(value){
  try{
    const url=new URL(value);
    if(!["http:","https:"].includes(url.protocol)) return null;
    return url.hostname.toLowerCase();
  }catch{
    return null;
  }
}

function marketplaceHostMatches(marketplace,url){
  const host=urlHost(url);
  if(!host) return false;
  const key=text(marketplace).toLowerCase();
  const aliases={
    ebay:["ebay.com","ebay.co.uk","ebay.de","ebay.fr","ebay.it","ebay.ca","ebay.com.au"],
    goldin:["goldin.co"],
    pwcc:["pwccmarketplace.com"],
    comc:["comc.com"]
  };
  const allowed=aliases[key];
  if(allowed){
    return allowed.some(domain=>host===domain || host.endsWith("."+domain));
  }
  const token=key.replace(/[^a-z0-9]/g,"");
  return token.length>=3 &&
    host.replace(/[^a-z0-9.]/g,"").includes(token);
}

function ebayItemIdFromUrl(value){
  try{
    const url=new URL(value);
    const match=url.pathname.match(
      /\/itm\/(?:[^/]+\/)?(\d{9,15})(?:\/|$)/
    );
    return match?.[1]||null;
  }catch{
    return null;
  }
}

function stableSaleIdMatchesMarketplace(marketplace,value){
  const id=text(value);
  if(!id) return false;
  const key=text(marketplace).toLowerCase();

  if(key==="ebay"){
    return /^\d{9,15}$/.test(id);
  }

  return false;
}

function directMarketplaceLocatorValid(marketplace,url){
  if(!marketplaceHostMatches(marketplace,url)) return false;
  const key=text(marketplace).toLowerCase();

  if(key==="ebay"){
    return Boolean(ebayItemIdFromUrl(url));
  }

  return true;
}

export function hasOriginalLocator(evidence={},marketplace=""){
  const directUrl=text(
    evidence.direct_marketplace_url ||
    evidence.original_marketplace_url
  );
  const stableSaleId=text(
    evidence.source_sale_id ||
    evidence.marketplace_sale_id ||
    evidence.listing_id
  );
  return Boolean(
    (stableSaleId &&
      stableSaleIdMatchesMarketplace(marketplace,stableSaleId)) ||
    (directUrl && directMarketplaceLocatorValid(marketplace,directUrl))
  );
}

function validateListingIdentity({task={},record={},product={},evidence={}}={}){
  const errors=[];
  if(!text(evidence.product_id) || evidence.product_id!==record.product_id){
    errors.push("evidence product_id does not match market record product");
  }

  const identity=assessListingIdentity({
    record,
    product,
    listing:evidence.listing_identity||{}
  });
  errors.push(...identity.errors);

  if(text(task.player)!==text(record.player)){
    errors.push("verification task player does not match market record");
  }
  if(text(task.parallel)!==text(record.parallel)){
    errors.push("verification task parallel does not match market record");
  }

  return errors;
}

export function validateEvidence({task={},record={},product={},evidence={}}={}){
  const errors=[];
  if(evidence.schema_version!==2){
    errors.push("evidence schema_version must be 2");
  }
  if(!text(evidence.task_id) || evidence.task_id!==task.task_id){
    errors.push("evidence task_id does not match verification task");
  }
  if(
    !text(evidence.market_source_file) ||
    evidence.market_source_file!==task.market_source_file
  ){
    errors.push("evidence market_source_file does not match task");
  }
  if(
    !Number.isInteger(Number(evidence.sale_index)) ||
    Number(evidence.sale_index)!==Number(task.sale_index)
  ){
    errors.push("evidence sale_index does not match task");
  }

  for(const key of ["card_id","player","set","parallel"]){
    if(text(evidence[key])!==text(task[key])){
      errors.push("evidence "+key+" does not match task");
    }
  }

  if(text(record.team)!==text(task.team)){
    errors.push("market record team does not match task");
  }
  if(text(record.player)!==text(task.player)){
    errors.push("market record player does not match task");
  }
  if(text(record.set)!==text(task.set)){
    errors.push("market record set does not match task");
  }
  if(text(record.parallel)!==text(task.parallel)){
    errors.push("market record parallel does not match task");
  }

  errors.push(...validateListingIdentity({
    task,
    record,
    product,
    evidence
  }));

  const sale=record.sales?.[Number(task.sale_index)];
  if(!sale){
    errors.push("task sale_index does not resolve to market record sale");
    return {valid:false,errors};
  }

  if(!validDate(evidence.sale_date) || evidence.sale_date!==sale.sale_date){
    errors.push("evidence sale_date does not match stored realized sale");
  }

  const evidencePrice=money(evidence.sale_price_usd);
  const storedPrice=money(sale.sale_price);
  if(
    !Number.isFinite(evidencePrice) ||
    !Number.isFinite(storedPrice) ||
    Math.abs(evidencePrice-storedPrice)>0.005
  ){
    errors.push("evidence sale_price_usd does not match stored realized sale");
  }

  if(
    text(evidence.marketplace).toLowerCase()!==
    text(sale.marketplace).toLowerCase()
  ){
    errors.push("evidence marketplace does not match stored realized sale");
  }

  if(text(sale.serial_copy)){
    if(text(evidence.serial_copy)!==text(sale.serial_copy)){
      errors.push("evidence serial_copy does not match stored realized sale");
    }
  }else if(text(evidence.serial_copy)){
    errors.push("evidence serial_copy supplied for sale without stored serial copy");
  }

  const directUrl=text(
    evidence.direct_marketplace_url ||
    evidence.original_marketplace_url
  );
  const stableSaleId=text(
    evidence.source_sale_id ||
    evidence.marketplace_sale_id ||
    evidence.listing_id
  );
  if(!directUrl && !stableSaleId){
    errors.push("evidence requires direct marketplace URL or stable sale id");
  }
  if(directUrl && !marketplaceHostMatches(sale.marketplace,directUrl)){
    errors.push("direct marketplace URL host does not match stored marketplace");
  }else if(
    directUrl &&
    !directMarketplaceLocatorValid(sale.marketplace,directUrl)
  ){
    errors.push("direct marketplace URL is not a qualifying sale listing");
  }
  if(
    stableSaleId &&
    !stableSaleIdMatchesMarketplace(sale.marketplace,stableSaleId)
  ){
    errors.push("stable sale id format is not valid for stored marketplace");
  }
  if(directUrl && stableSaleId){
    const key=text(sale.marketplace).toLowerCase();
    const urlSaleId=key==="ebay" ? ebayItemIdFromUrl(directUrl) : null;
    if(urlSaleId && urlSaleId!==stableSaleId){
      errors.push("direct marketplace URL and stable sale id disagree");
    }
  }
  if(!hasOriginalLocator(evidence,sale.marketplace)){
    errors.push("evidence has no qualifying original marketplace locator");
  }

  if(!validDate(evidence.verified_at)){
    errors.push("evidence verified_at must be a valid YYYY-MM-DD date");
  }

  return {valid:errors.length===0,errors};
}

function evidenceSummary(record){
  let original=0,secondary=0,discovery=0;
  for(const sale of record.sales||[]){
    if(
      sale.original_marketplace_verified===true &&
      sale.evidence_status==="original-marketplace-verified"
    ){
      original++;
    }else if(sale.evidence_status==="secondary-source-realized-sale"){
      secondary++;
    }else if(sale.evidence_status==="discovery-only"){
      discovery++;
    }
  }
  const total=(record.sales||[]).length;
  return {
    status:
      total>0 && original===total
        ? "original-marketplace-verified"
        : original>0
          ? "mixed-original-secondary"
          : secondary>0
            ? "secondary-source-only"
            : "discovery-only",
    original_marketplace_verified_sale_count:original,
    secondary_source_realized_sale_count:secondary,
    discovery_only_sale_count:discovery
  };
}

export function applyEvidence({task={},record={},product={},evidence={}}={}){
  const validation=validateEvidence({task,record,product,evidence});
  if(!validation.valid){
    return {
      applied:false,
      errors:validation.errors,
      record:clone(record)
    };
  }

  const next=clone(record);
  const sale=next.sales[Number(task.sale_index)];
  const directUrl=text(
    evidence.direct_marketplace_url ||
    evidence.original_marketplace_url
  );
  const stableSaleId=text(
    evidence.source_sale_id ||
    evidence.marketplace_sale_id ||
    evidence.listing_id
  );

  if(directUrl) sale.direct_marketplace_url=directUrl;
  if(stableSaleId) sale.source_sale_id=stableSaleId;
  sale.original_marketplace_identity={
    product_id:evidence.product_id,
    series:text(evidence.listing_identity?.series),
    card_number:text(evidence.listing_identity?.card_number),
    parallel:text(evidence.listing_identity?.parallel),
    print_run:Number(evidence.listing_identity?.print_run),
    player:text(evidence.listing_identity?.player),
    team:text(evidence.listing_identity?.team)||null
  };
  sale.direct_marketplace_url_recovered=Boolean(directUrl);
  sale.evidence_status="original-marketplace-verified";
  sale.original_marketplace_verified=true;
  sale.original_marketplace_verified_at=evidence.verified_at;
  if(text(evidence.verification_note)){
    sale.original_marketplace_verification_note=
      text(evidence.verification_note);
  }

  next.evidence_summary=evidenceSummary(next);

  if(next.calculated_market_value){
    const allVerified=
      next.evidence_summary.original_marketplace_verified_sale_count===
      (next.sales||[]).length &&
      (next.sales||[]).length>0;
    if(allVerified){
      next.calculated_market_value.status="verified-original-marketplace";
    }else if(
      next.evidence_summary.original_marketplace_verified_sale_count>0
    ){
      next.calculated_market_value.status="provisional-mixed-source";
    }
  }

  return {
    applied:true,
    errors:[],
    record:next,
    contribution_original_marketplace_verified:
      next.evidence_summary.original_marketplace_verified_sale_count===
      (next.sales||[]).length &&
      (next.sales||[]).length>0
  };
}
