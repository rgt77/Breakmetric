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

export function fairCollectionOrder(tasks=[]){
  const teams=new Map();
  for(const task of tasks){
    const team=String(task.team||"Unknown");
    if(!teams.has(team)) teams.set(team,[]);
    teams.get(team).push(task);
  }

  const orderedByTeam=new Map(
    [...teams.entries()].map(([team,rows])=>[
      team,
      breadthAwareOrder(rows)
    ])
  );
  const teamNames=[...orderedByTeam.keys()].sort((a,b)=>a.localeCompare(b));
  const result=[];
  let remaining=true;
  let round=0;
  while(remaining){
    remaining=false;
    for(const team of teamNames){
      const rows=orderedByTeam.get(team);
      if(round<rows.length){
        result.push(rows[round]);
        remaining=true;
      }
    }
    round++;
  }
  return result;
}

export function selectCursorBatch(tasks=[],{
  cursor=0,
  batchSize=20,
  maxTasksPerSubject=2,
  maxTasksPerTeam=2
}={}){
  const ordered=fairCollectionOrder(tasks);
  if(!ordered.length){
    return {batch:[],cursor:0,next_cursor:0,queue_size:0,wrapped:false};
  }

  const size=Math.max(1,Number(batchSize)||20);
  const start=((Number(cursor)||0)%ordered.length+ordered.length)%ordered.length;
  const subjectCounts=new Map();
  const teamCounts=new Map();
  const batch=[];
  let scanned=0;

  while(batch.length<size&&scanned<ordered.length){
    const index=(start+scanned)%ordered.length;
    const task=ordered[index];
    const subject=String(task.subjects?.[0]||"Unknown");
    const team=String(task.team||"Unknown");
    const subjectCount=subjectCounts.get(subject)||0;
    const teamCount=teamCounts.get(team)||0;

    if(
      subjectCount<Math.max(1,Number(maxTasksPerSubject)||2) &&
      teamCount<Math.max(1,Number(maxTasksPerTeam)||2)
    ){
      batch.push(task);
      subjectCounts.set(subject,subjectCount+1);
      teamCounts.set(team,teamCount+1);
    }
    scanned++;
  }

  const nextCursor=(start+scanned)%ordered.length;
  return {
    batch,
    cursor:start,
    next_cursor:nextCursor,
    queue_size:ordered.length,
    scanned_count:scanned,
    wrapped:start+scanned>=ordered.length
  };
}

export function extractProviderCardNumber(productName=""){
  const text=String(productName||"");
  const hash=[...text.matchAll(/#([A-Za-z0-9-]+)/g)];
  if(hash.length) return normalizeText(hash[hash.length-1][1]);
  const trailing=text.match(/(?:^|\s)([A-Za-z]{1,5}-?[A-Za-z0-9-]*\d+[A-Za-z0-9-]*)\s*$/);
  return trailing?normalizeText(trailing[1]):null;
}

export function indexProviderRowsByCardNumber(rows=[]){
  const map=new Map();
  for(const row of rows){
    const cardNumber=extractProviderCardNumber(
      row["product-name"]||row.product_name||""
    );
    if(!cardNumber) continue;
    if(!map.has(cardNumber)) map.set(cardNumber,[]);
    map.get(cardNumber).push(row);
  }
  return map;
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
