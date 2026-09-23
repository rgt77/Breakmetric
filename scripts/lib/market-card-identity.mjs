function text(value){
  return typeof value==="string" ? value.trim() : "";
}

function normalizeIdentityText(value){
  return text(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g,"")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g," ")
    .trim()
    .replace(/\s+/g," ");
}

function acceptedSeries(product={}){
  return (product.market_identity?.accepted_series_aliases||[])
    .map(normalizeIdentityText)
    .filter(Boolean);
}

export function assessListingIdentity({
  record={},
  product={},
  listing={}
}={}){
  const errors=[];
  const checks={
    product:false,
    series:false,
    card_number:false,
    parallel:false,
    print_run:false,
    player:false,
    team:true
  };

  if(!product?.id || product.id!==record.product_id){
    errors.push("product identity metadata does not match market record product");
  }else{
    checks.product=true;
  }

  const observedSeries=normalizeIdentityText(listing.series);
  const allowed=acceptedSeries(product);
  if(!observedSeries){
    errors.push("listing identity series is required");
  }else if(!allowed.includes(observedSeries)){
    errors.push("listing identity series does not match target product family");
  }else{
    checks.series=true;
  }

  if(
    normalizeIdentityText(listing.card_number)!==
    normalizeIdentityText(record.card_number)
  ){
    errors.push("listing identity card_number does not match market record");
  }else if(normalizeIdentityText(record.card_number)){
    checks.card_number=true;
  }

  if(
    normalizeIdentityText(listing.parallel)!==
    normalizeIdentityText(record.parallel)
  ){
    errors.push("listing identity parallel does not match market record");
  }else if(normalizeIdentityText(record.parallel)){
    checks.parallel=true;
  }

  const expectedPrintRun=
    record.serial_numbering===null ||
    record.serial_numbering===undefined
      ? null
      : Number(record.serial_numbering);
  const observedPrintRun=
    listing.print_run===null ||
    listing.print_run===undefined ||
    listing.print_run===""
      ? null
      : Number(listing.print_run);
  if(
    expectedPrintRun===null
      ? observedPrintRun!==null
      : (
          !Number.isInteger(observedPrintRun) ||
          observedPrintRun!==expectedPrintRun
        )
  ){
    errors.push("listing identity print_run does not match market record");
  }else{
    checks.print_run=true;
  }

  if(
    normalizeIdentityText(listing.player)!==
    normalizeIdentityText(record.player)
  ){
    errors.push("listing identity player does not match market record");
  }else if(normalizeIdentityText(record.player)){
    checks.player=true;
  }

  if(
    text(listing.team) &&
    normalizeIdentityText(listing.team)!==
      normalizeIdentityText(record.team)
  ){
    checks.team=false;
    errors.push("listing identity team does not match market record");
  }

  return {
    valid:errors.length===0,
    errors,
    checks,
    normalized:{
      series:observedSeries||null,
      card_number:normalizeIdentityText(listing.card_number)||null,
      parallel:normalizeIdentityText(listing.parallel)||null,
      print_run:observedPrintRun,
      player:normalizeIdentityText(listing.player)||null,
      team:normalizeIdentityText(listing.team)||null
    }
  };
}

export function storedOriginalIdentityMatches({
  record={},
  sale={},
  product={}
}={}){
  const identity=sale.original_marketplace_identity||{};
  if(identity.product_id!==record.product_id) return false;
  return assessListingIdentity({
    record,
    product,
    listing:identity
  }).valid;
}
