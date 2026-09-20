// BreakMetric EV contribution provenance v1.
(function(root){
  "use strict";
  const api={};

  api.validate=function(data={},teamEv={}){
    const errors=[];
    if(data.schema_version!==1) errors.push("EV provenance schema mismatch");
    if(data.model!=="ev-contribution-provenance-v1") errors.push("EV provenance model mismatch");
    if(!Array.isArray(data.entries)) errors.push("EV provenance entries missing");
    const evRows=[];
    for(const [team,row] of Object.entries(teamEv.teams||{})){
      for(const item of row.contributions||[]) evRows.push({team,...item});
    }
    if((data.entries||[]).length!==evRows.length) errors.push("EV provenance contribution count mismatch");
    const map=new Map((data.entries||[]).map(x=>[x.team+"|"+x.card_id,x]));
    for(const item of evRows){
      const entry=map.get(item.team+"|"+item.card_id);
      if(!entry) errors.push("EV provenance entry missing: "+item.team+" / "+item.card_id);
      else{
        if(!entry.derived_ev_file) errors.push("EV derivation file missing: "+item.card_id);
        if(entry.market_source_file!==item.market_source_file) errors.push("EV provenance market source mismatch: "+item.card_id);
        if(Math.abs(Number(entry.ev_contribution_usd)-Number(item.ev_contribution_usd))>0.0001) errors.push("EV provenance contribution mismatch: "+item.card_id);
      }
    }
    return {valid:errors.length===0,errors};
  };

  api.teamSummary=function(data={},team){
    const rows=(data.entries||[]).filter(x=>x.team===team);
    return {
      contribution_count:rows.length,
      derivation_linked_count:rows.filter(x=>Boolean(x.derived_ev_file)).length,
      market_linked_count:rows.filter(x=>Boolean(x.market_source_file)).length,
      formula_count:new Set(rows.map(x=>x.formula).filter(Boolean)).size
    };
  };

  api.teamEntries=function(data={},team){
    return (data.entries||[]).filter(x=>x.team===team)
      .sort((a,b)=>Number(b.ev_contribution_usd)-Number(a.ev_contribution_usd));
  };

  root.BreakMetricEvContributionProvenance=Object.freeze(api);
})(typeof window!=="undefined" ? window : globalThis);
