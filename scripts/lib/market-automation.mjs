const RELEASE_TOKENS=["2026","topps","chrome","premier","league"];
const FORBIDDEN_SERIES_TOKENS=["sapphire"];

export function normalizeText(value=""){
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .toLowerCase()
    .replace(/&/g," and ")
    .replace(/[^a-z0-9]+/g," ")
    .trim()
    .replace(/\s+/g," ");
}

export function buildSearchQuery(task={}){
  const subject=(task.subjects||[]).join(" ");
  const set=task.set && task.set!=="Base Cards" ? task.set : "";
  const parallel=task.parallel && task.parallel!=="Base" ? task.parallel : "";
  return [
    "2026 Topps Chrome Premier League",
    subject,
    set,
    parallel,
    task.card_number ? "#"+task.card_number : ""
  ].filter(Boolean).join(" ");
}

function tokenBoundaryIncludes(haystack,needle){
  const h=" "+normalizeText(haystack)+" ";
  const n=normalizeText(needle);
  return n ? h.includes(" "+n+" ") : false;
}

function extractBracketParallel(productName=""){
  const matches=[...String(productName).matchAll(/\[([^\]]+)\]/g)];
  if(!matches.length) return null;
  return matches[matches.length-1][1];
}

function cardNumberMatches(productName,cardNumber){
  const normalized=normalizeText(productName);
  const target=normalizeText(cardNumber);
  if(!target) return false;
  const tokens=normalized.split(" ");
  const targetTokens=target.split(" ");
  for(let i=0;i<=tokens.length-targetTokens.length;i++){
    if(targetTokens.every((t,j)=>tokens[i+j]===t)) return true;
  }
  return false;
}

export function exactProviderIdentity(task={},product={}){
  const consoleName=String(product["console-name"]||product.console_name||"");
  const productName=String(product["product-name"]||product.product_name||"");
  const combined=normalizeText(consoleName+" "+productName);
  const reasons=[];

  for(const token of RELEASE_TOKENS){
    if(!tokenBoundaryIncludes(combined,token)) reasons.push("missing-release-token:"+token);
  }
  for(const token of FORBIDDEN_SERIES_TOKENS){
    if(tokenBoundaryIncludes(combined,token)) reasons.push("forbidden-series-token:"+token);
  }

  const subjects=(task.subjects||[]).filter(Boolean);
  for(const subject of subjects){
    const normalizedSubject=normalizeText(subject);
    if(normalizedSubject && !normalizeText(productName).includes(normalizedSubject)){
      reasons.push("subject-mismatch:"+subject);
    }
  }

  if(!cardNumberMatches(productName,task.card_number)){
    reasons.push("card-number-mismatch");
  }

  const expectedParallel=String(task.parallel||"Base");
  const bracketParallel=extractBracketParallel(productName);
  if(expectedParallel==="Base"){
    if(bracketParallel && normalizeText(bracketParallel)!=="base"){
      reasons.push("parallel-mismatch:"+bracketParallel);
    }
  }else if(bracketParallel){
    if(normalizeText(bracketParallel)!==normalizeText(expectedParallel)){
      reasons.push("parallel-mismatch:"+bracketParallel);
    }
  }else if(!normalizeText(productName).includes(normalizeText(expectedParallel))){
    reasons.push("parallel-mismatch");
  }

  if(task.set && task.set!=="Base Cards"){
    const normalizedSet=normalizeText(task.set);
    if(
      normalizedSet &&
      !normalizeText(consoleName).includes(normalizedSet) &&
      !normalizeText(productName).includes(normalizedSet)
    ){
      reasons.push("set-mismatch");
    }
  }

  return {
    exact:reasons.length===0,
    reasons,
    console_name:consoleName,
    product_name:productName,
    provider_product_id:String(product.id||"")
  };
}

export function breadthAwareOrder(tasks=[]){
  const groups=new Map();
  for(const task of tasks){
    const subject=String(task.subjects?.[0]||"Unknown");
    if(!groups.has(subject)) groups.set(subject,[]);
    groups.get(subject).push(task);
  }
  for(const rows of groups.values()){
    rows.sort((a,b)=>
      Number(b.collection_priority_score??b.economic_priority_proxy_usd??0)-
      Number(a.collection_priority_score??a.economic_priority_proxy_usd??0) ||
      String(a.task_id).localeCompare(String(b.task_id))
    );
  }

  const result=[];
  while([...groups.values()].some(rows=>rows.length)){
    const subjects=[...groups.keys()]
      .filter(subject=>groups.get(subject).length)
      .sort((a,b)=>{
        const av=Number(
          groups.get(a)[0]?.collection_priority_score ??
          groups.get(a)[0]?.economic_priority_proxy_usd ??
          0
        );
        const bv=Number(
          groups.get(b)[0]?.collection_priority_score ??
          groups.get(b)[0]?.economic_priority_proxy_usd ??
          0
        );
        return bv-av || a.localeCompare(b);
      });
    for(const subject of subjects){
      result.push(groups.get(subject).shift());
    }
  }
  return result;
}

export function selectRotatingBatch(tasks=[],{
  nowMs=Date.now(),
  cadenceMinutes=15,
  batchSize=20
}={}){
  const ordered=breadthAwareOrder(tasks);
  if(!ordered.length) return {batch:[],shard_index:0,shard_count:0};
  const size=Math.max(1,Number(batchSize)||20);
  const shardCount=Math.ceil(ordered.length/size);
  const interval=Math.max(1,Number(cadenceMinutes)||15)*60*1000;
  const shardIndex=Math.floor(nowMs/interval)%shardCount;
  const start=shardIndex*size;
  return {
    batch:ordered.slice(start,start+size),
    shard_index:shardIndex,
    shard_count:shardCount
  };
}

export function apiPriceUsd(product={}){
  const cents=Number(product["loose-price"]);
  return Number.isFinite(cents)&&cents>0 ? Math.round(cents)/100 : null;
}

export function csvPriceUsd(row={}){
  const value=Number(String(row["loose-price"]??"").replace(/[$,]/g,""));
  return Number.isFinite(value)&&value>0 ? value : null;
}

export function parseCsv(text=""){
  const rows=[];
  let row=[],field="",quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(ch==='"'){
      if(quoted && text[i+1]==='"'){field+='"';i++;}
      else quoted=!quoted;
    }else if(ch==="," && !quoted){
      row.push(field);field="";
    }else if((ch==="\n"||ch==="\r") && !quoted){
      if(ch==="\r" && text[i+1]==="\n") i++;
      row.push(field);field="";
      if(row.some(cell=>cell!=="")) rows.push(row);
      row=[];
    }else{
      field+=ch;
    }
  }
  if(field!==""||row.length){row.push(field);rows.push(row);}
  if(!rows.length) return [];
  const header=rows[0].map(x=>x.trim());
  return rows.slice(1).map(cells=>
    Object.fromEntries(header.map((key,index)=>[key,cells[index]??""]))
  );
}

export function mergeObservation(store={},task={},observation={},observedAt){
  const taskId=task.task_id;
  const previous=store.entries?.[taskId]||null;
  const comparable={
    source:observation.source,
    status:observation.status,
    provider_product_id:observation.provider_product_id||null,
    exact_identity:observation.exact_identity===true,
    raw_price_usd:observation.raw_price_usd??null,
    sales_volume_yearly:observation.sales_volume_yearly??null,
    query:observation.query||null,
    provider_product_name:observation.provider_product_name||null,
    provider_set_name:observation.provider_set_name||null,
    identity_reasons:observation.identity_reasons||[]
  };
  const previousComparable=previous ? {
    source:previous.source,
    status:previous.status,
    provider_product_id:previous.provider_product_id||null,
    exact_identity:previous.exact_identity===true,
    raw_price_usd:previous.raw_price_usd??null,
    sales_volume_yearly:previous.sales_volume_yearly??null,
    query:previous.query||null,
    provider_product_name:previous.provider_product_name||null,
    provider_set_name:previous.provider_set_name||null,
    identity_reasons:previous.identity_reasons||[]
  } : null;
  const changed=JSON.stringify(previousComparable)!==JSON.stringify(comparable);
  if(!changed) return {changed:false,entry:previous};

  const entry={
    task_id:taskId,
    team:task.team,
    category:task.category,
    set:task.set,
    card_number:String(task.card_number),
    subjects:[...(task.subjects||[])],
    parallel:task.parallel,
    ...comparable,
    first_observed_at:previous?.first_observed_at||observedAt,
    last_changed_at:observedAt
  };
  store.entries=store.entries||{};
  store.entries[taskId]=entry;
  return {changed:true,entry};
}
