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

function rawModeledEstimate(task={},evidence=[]){
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

export function evaluateConfidenceGate(raw={},policy={},calibration={}){
  if(raw.tier!=="C"&&raw.tier!=="D"){
    return {
      applies:false,
      passed:false,
      status:"not-applicable",
      reasons:[]
    };
  }

  const reasons=[];
  const global=policy.calibration_gate||{};
  const baseline=calibration?.baseline||calibration||{};
  const population=baseline.population||{};

  const holdouts=Number(baseline.canonical_holdout_count||0);
  if(holdouts<Number(global.min_canonical_holdouts||0)){
    reasons.push("insufficient-canonical-holdouts");
  }

  const teams=Number(population.team_count||0);
  if(teams<Number(global.min_team_count||0)){
    reasons.push("insufficient-team-diversity");
  }

  const coverage=Number(baseline.prediction_coverage_pct||0);
  if(coverage<Number(global.min_prediction_coverage_pct||0)){
    reasons.push("prediction-coverage-too-low");
  }

  const medianApe=Number(
    baseline.median_absolute_percentage_error_pct
  );
  if(
    !Number.isFinite(medianApe) ||
    medianApe>
      Number(global.max_median_absolute_percentage_error_pct??Infinity)
  ){
    reasons.push("median-absolute-percentage-error-too-high");
  }

  const local=
    policy.candidate_evidence_gate?.[raw.basis]||{};
  const support=Array.isArray(raw.supporting_evidence)
    ?raw.supporting_evidence
    :[];
  if(
    support.length<
      Number(local.min_total_evidence||0)
  ){
    reasons.push("insufficient-local-evidence");
  }

  const distinctTeams=new Set(
    support.map(row=>row.team).filter(Boolean)
  ).size;
  if(
    distinctTeams<
      Number(local.min_distinct_teams||0)
  ){
    reasons.push("insufficient-local-team-diversity");
  }

  return {
    applies:true,
    passed:reasons.length===0,
    status:reasons.length===0?"passed":"failed",
    reasons,
    calibration:{
      canonical_holdout_count:holdouts,
      team_count:teams,
      prediction_coverage_pct:coverage,
      median_absolute_percentage_error_pct:
        Number.isFinite(medianApe)?medianApe:null
    },
    local_evidence:{
      total_count:support.length,
      distinct_team_count:distinctTeams
    }
  };
}

export function estimateModeledValue(
  task={},
  evidence=[],
  {
    gatePolicy=null,
    calibration=null
  }={}
){
  const raw=rawModeledEstimate(task,evidence);
  if(!gatePolicy){
    return raw;
  }

  if(raw.tier==="E"){
    return {
      ...raw,
      proposed_tier:"E",
      proposed_basis:"unknown",
      proposed_confidence:"none",
      confidence_gate:{
        applies:false,
        passed:false,
        status:"not-applicable",
        reasons:[]
      }
    };
  }

  const gate=evaluateConfidenceGate(
    raw,
    gatePolicy,
    calibration||{}
  );
  if(gate.passed){
    return {
      ...raw,
      proposed_tier:raw.tier,
      proposed_basis:raw.basis,
      proposed_confidence:raw.confidence,
      confidence_gate:gate
    };
  }

  return {
    tier:gatePolicy.failure_behavior?.final_tier||"E",
    basis:
      gatePolicy.failure_behavior?.final_basis||
      "confidence-gate-failed",
    confidence:"none",
    value:null,
    supporting_evidence:raw.supporting_evidence,
    proposed_tier:raw.tier,
    proposed_basis:raw.basis,
    proposed_confidence:raw.confidence,
    confidence_gate:gate
  };
}
