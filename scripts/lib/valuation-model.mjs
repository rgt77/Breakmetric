const round=(value,digits=8)=>{
  const factor=10**digits;
  return Math.round(Number(value)*factor)/factor;
};

export function median(values=[]){
  const xs=values
    .map(Number)
    .filter(Number.isFinite)
    .sort((a,b)=>a-b);
  if(!xs.length) return null;
  const m=Math.floor(xs.length/2);
  return xs.length%2 ? xs[m] : (xs[m-1]+xs[m])/2;
}

export function evidenceBreakdown(rows=[]){
  return {
    total_count:rows.length,
    canonical_realized_sale_count:
      rows.filter(row=>row.evidence_class==="canonical-realized-sale").length,
    exact_provider_current_price_count:
      rows.filter(row=>row.evidence_class==="exact-provider-current-price").length
  };
}

export function estimateModeledValue(task={},evidence=[]){
  const subject=task.subjects?.[0]||task.subject||null;
  const team=task.team||null;
  const category=task.category||null;

  const sameSubject=evidence.filter(row=>
    row.team===team &&
    row.subject===subject &&
    row.category===category
  );
  if(sameSubject.length){
    return {
      tier:"C",
      basis:"same-subject-same-category-model",
      confidence:"low",
      value:round(median(sameSubject.map(row=>row.value))),
      supporting_evidence:sameSubject
    };
  }

  const teamCategory=evidence.filter(row=>
    row.team===team &&
    row.category===category
  );
  if(teamCategory.length>=3){
    return {
      tier:"D",
      basis:"team-category-model",
      confidence:"very-low",
      value:round(median(teamCategory.map(row=>row.value))),
      supporting_evidence:teamCategory
    };
  }

  const productCategory=evidence.filter(row=>row.category===category);
  if(productCategory.length>=3){
    return {
      tier:"D",
      basis:"product-category-model",
      confidence:"very-low",
      value:round(median(productCategory.map(row=>row.value))),
      supporting_evidence:productCategory
    };
  }

  return {
    tier:"E",
    basis:"unknown",
    confidence:"none",
    value:null,
    supporting_evidence:[]
  };
}
