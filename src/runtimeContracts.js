// BreakMetric runtime data contracts v1.
// Browser-safe, dependency-free validation used before fetched datasets become active.

(function(root){
  "use strict";

  const api={};

  function finite(value){
    return Number.isFinite(Number(value));
  }

  function nonNegative(value){
    return finite(value) && Number(value) >= 0;
  }

  function probability(value){
    return finite(value) && Number(value) >= 0 && Number(value) <= 100;
  }

  function uniqueStrings(values){
    const items=(values||[]).filter(x=>typeof x==="string" && x.length);
    return items.length===new Set(items).size;
  }

  function result(errors=[], warnings=[], metrics={}){
    return {valid:errors.length===0,errors,warnings,metrics};
  }

  function merge(results){
    const errors=[],warnings=[],metrics={};
    for(const item of results){
      if(!item) continue;
      errors.push(...(item.errors||[]));
      warnings.push(...(item.warnings||[]));
      Object.assign(metrics,item.metrics||{});
    }
    return result(errors,warnings,metrics);
  }

  api.teamNamesFromMetadata=function(metadata={}){
    return (metadata.teams||[]).map(x=>x?.name).filter(Boolean);
  };

  api.validateProductMetadata=function(metadata={}, productId){
    const errors=[],warnings=[];
    if(metadata.id!==productId) errors.push("product metadata id mismatch");
    if(typeof metadata.display_name!=="string" || !metadata.display_name) {
      errors.push("product display_name missing");
    }
    const teams=api.teamNamesFromMetadata(metadata);
    if(!teams.length) errors.push("product teams missing");
    if(!uniqueStrings(teams)) errors.push("product team names are not unique");
    if(teams.length!==20) warnings.push("expected 20 Premier League teams; found "+teams.length);
    return result(errors,warnings,{canonical_team_count:teams.length});
  };

  api.validateFormatCatalog=function(catalog={}, productId){
    const errors=[],warnings=[];
    if(catalog.product_id!==productId) errors.push("format catalog product_id mismatch");
    if(!Array.isArray(catalog.formats) || !catalog.formats.length) {
      errors.push("format catalog has no formats");
      return result(errors,warnings);
    }
    const ids=catalog.formats.map(x=>x?.id).filter(Boolean);
    if(ids.length!==catalog.formats.length) errors.push("format id missing");
    if(!uniqueStrings(ids)) errors.push("format ids are not unique");
    const ready=catalog.formats.filter(x=>x?.status==="ready");
    if(!ready.length) warnings.push("no ready formats");
    for(const format of ready){
      if(!format.analysis_data) errors.push("ready format "+format.id+" lacks analysis_data");
      if(!format.integrity_data) errors.push("ready format "+format.id+" lacks integrity_data");
      if(!format.analysis_unit) errors.push("ready format "+format.id+" lacks analysis_unit");
    }
    return result(errors,warnings,{format_count:catalog.formats.length,ready_format_count:ready.length});
  };

  api.validateProductId=function(data={}, productId, label="dataset"){
    return data?.product_id===productId
      ? result()
      : result([label+" product_id mismatch"]);
  };

  api.validateBaseChecklist=function(data={}, productId, canonicalTeams=[]){
    const errors=[],warnings=[];
    if(data.product_id!==productId) errors.push("base checklist product_id mismatch");
    if(!Array.isArray(data.cards) || !data.cards.length) errors.push("base checklist cards missing");
    const canonical=new Set(canonicalTeams);
    const seen=new Set();
    for(const card of data.cards||[]){
      if(card.card_number===undefined || card.card_number===null) errors.push("base card number missing");
      if(typeof card.player!=="string" || !card.player) errors.push("base card player missing");
      if(!canonical.has(card.team)) errors.push("base checklist unknown team: "+card.team);
      const key=String(card.card_number);
      if(seen.has(key)) errors.push("duplicate base card number: "+key);
      seen.add(key);
    }
    return result(errors,warnings,{base_card_count:(data.cards||[]).length});
  };

  api.validateAutographChecklist=function(data={}, productId, canonicalTeams=[]){
    const errors=[],warnings=[];
    if(data.product_id!==productId) errors.push("autograph checklist product_id mismatch");
    if(!Array.isArray(data.cards)) errors.push("autograph checklist cards missing");
    const canonical=new Set(canonicalTeams);
    const seen=new Set();
    for(const card of data.cards||[]){
      if(typeof card.card_number!=="string" || !card.card_number) errors.push("autograph card number missing");
      if(typeof card.player!=="string" || !card.player) errors.push("autograph player missing");
      if(card.team && !canonical.has(card.team)) errors.push("autograph checklist unknown team: "+card.team);
      const key=String(card.card_number);
      if(seen.has(key)) warnings.push("duplicate autograph card number: "+key);
      seen.add(key);
    }
    if(finite(data.checklist_size) && Number(data.checklist_size)!==(data.cards||[]).length) {
      warnings.push("autograph checklist_size differs from cards length");
    }
    return result(errors,warnings,{autograph_card_count:(data.cards||[]).length});
  };

  api.validatePlayerIndex=function(data={}, productId, canonicalTeams=[]){
    const errors=[],warnings=[];
    if(data.product_id!==productId) errors.push("player index product_id mismatch");
    if(!data.teams || Array.isArray(data.teams)) errors.push("player index teams object missing");
    const canonical=new Set(canonicalTeams);
    let players=0;
    for(const [team,entries] of Object.entries(data.teams||{})){
      if(!canonical.has(team)) errors.push("player index unknown team: "+team);
      if(!Array.isArray(entries)) {
        errors.push("player index team is not array: "+team);
        continue;
      }
      const names=[];
      for(const entry of entries){
        const name=entry?.player;
        if(typeof name!=="string" || !name) errors.push("player index player missing in "+team);
        else names.push(name);
        if(!nonNegative(entry?.total_checklist_entries)) {
          errors.push("invalid checklist entry count for "+team+" / "+name);
        }
      }
      if(!uniqueStrings(names)) warnings.push("duplicate player names in "+team);
      players+=entries.length;
    }
    return result(errors,warnings,{indexed_player_team_pairs:players});
  };

  api.validatePlayerProbabilities=function(data={}, productId, canonicalTeams=[]){
    const errors=[],warnings=[];
    if(data.product_id!==productId) errors.push("player probabilities product_id mismatch");
    const canonical=new Set(canonicalTeams);
    let playerRows=0;
    for(const [team,players] of Object.entries(data.teams||{})){
      if(!canonical.has(team)) errors.push("player probabilities unknown team: "+team);
      for(const [name,row] of Object.entries(players||{})){
        playerRows++;
        for(const category of ["base","inserts","autographs"]){
          const item=row?.[category]||{};
          if(!nonNegative(item.expected_hits_per_case)) {
            errors.push("negative/invalid expected hits: "+team+" / "+name+" / "+category);
          }
          if(!probability(item.chance_at_least_one_percent)) {
            errors.push("invalid hit probability: "+team+" / "+name+" / "+category);
          }
        }
        if(!nonNegative(row?.overall?.expected_modeled_hits_per_case)) {
          errors.push("invalid overall expected hits: "+team+" / "+name);
        }
        if(!probability(row?.overall?.chance_at_least_one_modeled_hit_percent)) {
          errors.push("invalid overall probability: "+team+" / "+name);
        }
        if(!probability(row?.coverage?.coverage_percent)) {
          errors.push("invalid probability coverage: "+team+" / "+name);
        }
      }
    }
    return result(errors,warnings,{player_probability_rows:playerRows});
  };

  api.validateTeamProbabilityDataset=function(data={}, productId, canonicalTeams=[], label="team probability"){
    const errors=[],warnings=[];
    if(data.product_id!==productId) errors.push(label+" product_id mismatch");
    if(!Array.isArray(data.teams)) errors.push(label+" teams array missing");
    const canonical=new Set(canonicalTeams);
    const names=[];
    for(const row of data.teams||[]){
      if(!canonical.has(row?.team)) errors.push(label+" unknown team: "+row?.team);
      else names.push(row.team);
      for(const [key,value] of Object.entries(row||{})){
        if(key==="team") continue;
        if(key.includes("expected_") && !nonNegative(value)) {
          errors.push(label+" invalid expected value: "+row?.team+" / "+key);
        }
        if(key.endsWith("_percent") && !probability(value)) {
          errors.push(label+" invalid percent: "+row?.team+" / "+key);
        }
      }
    }
    if(!uniqueStrings(names)) errors.push(label+" duplicate team rows");
    return result(errors,warnings,{[label.replace(/\s+/g,"_")+"_team_rows"]:names.length});
  };

  api.validateSupplyDataset=function(data={}, productId, canonicalTeams=[], label="supply"){
    const errors=[],warnings=[];
    if(data.product_id!==productId) errors.push(label+" product_id mismatch");
    const canonical=new Set(canonicalTeams);
    if(data.teams && !Array.isArray(data.teams)){
      for(const team of Object.keys(data.teams)){
        if(!canonical.has(team)) errors.push(label+" unknown team: "+team);
      }
    }
    return result(errors,warnings);
  };

  api.validateTeamEv=function(data={}, productId, canonicalTeams=[]){
    const errors=[],warnings=[];
    if(data.product_id!==productId) errors.push("team EV product_id mismatch");
    const canonical=new Set(canonicalTeams);
    let contributions=0;
    for(const [team,row] of Object.entries(data.teams||{})){
      if(!canonical.has(team)) errors.push("team EV unknown team: "+team);
      if(!nonNegative(row?.partial_ev_usd)) errors.push("invalid partial EV for "+team);
      if(!Array.isArray(row?.contributions)) errors.push("EV contributions missing for "+team);
      const list=row?.contributions||[];
      contributions+=list.length;
      if(Number(row?.valued_card_count)!==list.length) {
        errors.push("valued_card_count mismatch for "+team);
      }
      let sum=0;
      const ids=[];
      for(const item of list){
        if(typeof item?.card_id!=="string" || !item.card_id) errors.push("EV card_id missing for "+team);
        else ids.push(item.card_id);
        if(!nonNegative(item?.ev_contribution_usd)) errors.push("invalid EV contribution for "+team+" / "+item?.card_id);
        else sum+=Number(item.ev_contribution_usd);
        if(typeof item?.market_source_file!=="string" || !item.market_source_file) {
          warnings.push("EV market source missing for "+team+" / "+item?.card_id);
        }
      }
      if(!uniqueStrings(ids)) errors.push("duplicate EV card_id for "+team);
      if(Math.abs(sum-Number(row?.partial_ev_usd))>0.02) {
        errors.push("partial EV does not equal contribution sum for "+team);
      }
      if(finite(row?.partial_ev_sum_check_usd) &&
         Math.abs(sum-Number(row.partial_ev_sum_check_usd))>0.001) {
        errors.push("partial EV sum check mismatch for "+team);
      }
    }
    return result(errors,warnings,{ev_contribution_count:contributions});
  };

  api.validateMarketAudit=function(audit={}, productId, evData={}){
    const errors=[],warnings=[];
    if(audit.product_id!==productId) errors.push("market audit product_id mismatch");
    if(audit.result!=="pass") errors.push("market audit result is not pass");
    if(!Array.isArray(audit.entries)) errors.push("market audit entries missing");
    if(Number(audit.audited_card_contributions)!==(audit.entries||[]).length) {
      errors.push("market audit contribution count mismatch");
    }
    const team=audit.team;
    const evRows=team ? evData?.teams?.[team]?.contributions : null;
    if(!Array.isArray(evRows)) errors.push("market audit team not present in EV data");
    const auditKeys=(audit.entries||[]).map(x=>x.card_id+"|"+x.source_file).sort();
    const evKeys=(evRows||[]).map(x=>x.card_id+"|"+x.market_source_file).sort();
    if(auditKeys.length!==evKeys.length ||
       auditKeys.some((key,index)=>key!==evKeys[index])) {
      errors.push("market audit / EV contribution snapshot mismatch");
    }
    return result(errors,warnings,{market_audit_entry_count:auditKeys.length});
  };

  api.validateAnalysisBundle=function(bundle={}, context={}){
    const productId=context.productId;
    const canonical=api.teamNamesFromMetadata(bundle.metadata||{});
    const results=[
      api.validateProductMetadata(bundle.metadata,productId),
      api.validateBaseChecklist(bundle.baseChecklist,productId,canonical),
      api.validateAutographChecklist(bundle.autographChecklist,productId,canonical),
      api.validatePlayerIndex(bundle.playerIndex,productId,canonical),
      api.validatePlayerProbabilities(bundle.playerProbabilities,productId,canonical),
      api.validateTeamProbabilityDataset(bundle.autographProbabilities,productId,canonical,"autograph probability"),
      api.validateTeamProbabilityDataset(bundle.insertProbabilities,productId,canonical,"insert probability"),
      api.validateTeamProbabilityDataset(bundle.baseParallelProbabilities,productId,canonical,"base parallel probability"),
      api.validateSupplyDataset(bundle.liveSupply,productId,canonical,"live supply"),
      api.validateProductId(bundle.sealedSupply,productId,"sealed supply"),
      api.validateProductId(bundle.production,productId,"production estimate"),
      api.validateTeamEv(bundle.teamEv,productId,canonical),
      api.validateMarketAudit(bundle.marketAudit,productId,bundle.teamEv)
    ];
    return merge(results);
  };

  api.reconcileFormat=function(catalog={},storedFormat){
    const formats=catalog.formats||[];
    if(formats.some(x=>x.id===storedFormat)) return storedFormat;
    return formats.find(x=>x.status==="ready")?.id || formats[0]?.id || null;
  };

  api.reconcileTeam=function(metadata={},storedTeam){
    const teams=api.teamNamesFromMetadata(metadata);
    return teams.includes(storedTeam) ? storedTeam : (teams[0]||null);
  };

  api.reconcilePlayer=function(playerIndex={},team,storedPlayer){
    const players=(playerIndex.teams?.[team]||[]).map(x=>x.player);
    return players.includes(storedPlayer) ? storedPlayer : null;
  };

  api.isProbability=probability;
  api.isNonNegativeFinite=nonNegative;

  root.BreakMetricContracts=Object.freeze(api);
})(typeof window!=="undefined" ? window : globalThis);
