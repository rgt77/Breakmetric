function text(value){
  return typeof value==="string" ? value.trim() : "";
}

export function researchAttemptCount(candidate={}){
  return Array.isArray(candidate.research_attempts)
    ? candidate.research_attempts.length
    : 0;
}

export function researchSortKey(row={}){
  const candidate=row.candidate||{};
  const attempts=researchAttemptCount(candidate);
  return {
    attempted:attempts>0 ? 1 : 0,
    priority_rank:Number(row.priority_rank??Number.MAX_SAFE_INTEGER),
    sale_index:Number(candidate.sale_index??Number.MAX_SAFE_INTEGER),
    last_attempt:text(candidate.last_research_attempt_at)||"0000-00-00",
    task_id:text(candidate.task_id)
  };
}

export function nextResearchCandidate(rows=[]){
  const eligible=(rows||[]).filter(row=>{
    const candidate=row.candidate||{};
    return (
      row.sale_verified!==true &&
      candidate.assessment_status==="identity-match-sale-unresolved"
    );
  });

  eligible.sort((a,b)=>{
    const ka=researchSortKey(a);
    const kb=researchSortKey(b);
    return (
      ka.attempted-kb.attempted ||
      ka.priority_rank-kb.priority_rank ||
      ka.sale_index-kb.sale_index ||
      ka.last_attempt.localeCompare(kb.last_attempt) ||
      ka.task_id.localeCompare(kb.task_id)
    );
  });

  return eligible[0]||null;
}
