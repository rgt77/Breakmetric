// BreakMetric neutral team comparison model v1.
// Provides side-by-side factual metrics without value rankings or spot recommendations.
(function(root){
  "use strict";
  const api={};

  function byTeam(data={}){
    return new Map((data.teams||[]).map(row=>[row.team,row]));
  }

  function pct(value){
    const n=Number(value);
    return Number.isFinite(n) && n>=0 && n<=100 ? n : null;
  }

  api.build=function({
    metadata=null,
    autographProbabilities=null,
    insertProbabilities=null,
    baseParallelProbabilities=null,
    readiness=null,
    teamEv=null,
    marketRegistry=null
  }={}){
    const autos=byTeam(autographProbabilities||{});
    const inserts=byTeam(insertProbabilities||{});
    const bases=byTeam(baseParallelProbabilities||{});

    return (metadata?.teams||[]).map(teamItem=>{
      const team=teamItem.name;
      const ready=readiness?.[team]||null;
      const auto=autos.get(team);
      const insert=inserts.get(team);
      const base=bases.get(team);
      const ev=teamEv?.teams?.[team]||null;
      const market=marketRegistry?.teams?.[team]||null;
      const noAutos=ready?.probability?.autograph_checklist_count===0;

      return {
        team,
        probability_ready:ready?.probability?.ready===true,
        auto_chance_percent:noAutos ? 0 : pct(auto?.chance_at_least_one_autograph_in_case_percent),
        insert_chance_percent:pct(insert?.chance_at_least_one_insert_in_case_percent),
        base_parallel_chance_percent:pct(base?.chance_at_least_one_base_parallel_in_case_percent),
        ev_status:ready?.ev?.status||"not-valued",
        valued_card_count:Number(ev?.valued_card_count||0),
        market_status:ready?.market?.status||"not-audited",
        original_verified_count:Number(market?.original_marketplace_verified_contribution_count||0),
        audited_contribution_count:Number(market?.audited_contribution_count||0),
        roi_eligible:ready?.roi?.eligible===true
      };
    });
  };

  api.validate=function(rows=[],canonicalTeams=[]){
    const errors=[];
    if(rows.length!==canonicalTeams.length) errors.push("team comparison row count mismatch");
    rows.forEach((row,index)=>{
      if(row.team!==canonicalTeams[index]) errors.push("team comparison canonical order mismatch at "+index);
      for(const key of ["auto_chance_percent","insert_chance_percent","base_parallel_chance_percent"]){
        const value=row[key];
        if(value!==null && (!Number.isFinite(Number(value)) || Number(value)<0 || Number(value)>100)){
          errors.push("team comparison invalid probability: "+row.team+" / "+key);
        }
      }
      if(row.original_verified_count>row.audited_contribution_count){
        errors.push("team comparison verified count exceeds audited: "+row.team);
      }
      if(row.roi_eligible && row.ev_status!=="complete"){
        errors.push("team comparison ROI eligible without complete EV: "+row.team);
      }
    });
    return {valid:errors.length===0,errors};
  };

  api.formatPercent=function(value){
    return value===null || value===undefined ? "—" : Number(value).toFixed(2).replace(/\.00$/,"")+"%";
  };

  api.evLabel=function(row={}){
    if(row.ev_status==="complete") return "Complete";
    if(row.ev_status==="partial") return "Partial · "+row.valued_card_count;
    return "Not valued";
  };

  api.marketLabel=function(row={}){
    if(row.market_status==="original-verified") return "Original verified";
    if(row.market_status==="mixed") return "Mixed";
    if(row.market_status==="secondary-source") return "Secondary";
    if(row.market_status==="audited") return "Audited";
    return "Not audited";
  };

  root.BreakMetricTeamComparison=Object.freeze(api);
})(typeof window!=="undefined" ? window : globalThis);
