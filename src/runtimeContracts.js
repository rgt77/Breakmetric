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

  api.validateProductCatalog=function(catalog={}){
    const errors=[],warnings=[];
    const products=catalog.products;

    if(!Array.isArray(products) || !products.length){
      errors.push("product catalog has no products");
      return result(errors,warnings);
    }

    const allowedStatuses=new Set(["ready","pending"]);
    const ids=[];
    let readyCount=0;
    let pendingCount=0;

    for(const product of products){
      if(typeof product?.id!=="string" || !product.id){
        errors.push("product id missing");
        continue;
      }

      ids.push(product.id);

      if(!allowedStatuses.has(product.status)){
        errors.push("invalid product status: "+product.id);
      }

      if(typeof product.display_name!=="string" || !product.display_name){
        errors.push("product display_name missing: "+product.id);
      }
      if(typeof product.brand!=="string" || !product.brand){
        errors.push("product brand missing: "+product.id);
      }
      if(typeof product.competition!=="string" || !product.competition){
        errors.push("product competition missing: "+product.id);
      }

      const year=Number(product.year);
      if(!Number.isInteger(year) || year<1900 || year>2200){
        errors.push("invalid product year: "+product.id);
      }

      if(product.status==="ready"){
        readyCount++;
        if(product.active!==true){
          warnings.push("ready product is not active: "+product.id);
        }
        for(const key of ["product_data","format_data","integrity_data"]){
          if(typeof product[key]!=="string" || !product[key]){
            errors.push("ready product "+product.id+" lacks "+key);
          }
        }
      }

      if(product.status==="pending"){
        pendingCount++;
        if(product.active===true){
          warnings.push("pending product is marked active: "+product.id);
        }
        if(product.integrity_data){
          warnings.push("pending product has integrity_data: "+product.id);
        }
      }
    }

    if(!uniqueStrings(ids)) errors.push("product ids are not unique");
    if(!readyCount) warnings.push("product catalog has no ready products");

    return result(errors,warnings,{
      product_count:products.length,
      ready_product_count:readyCount,
      pending_product_count:pendingCount
    });
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

  api.validateProductMetadataAgainstCatalog=function(metadata={}, catalogEntry={}){
    const errors=[],warnings=[];

    if(metadata.id!==catalogEntry.id){
      errors.push("product metadata id differs from catalog entry");
    }

    for(const key of ["display_name","brand","competition","year"]){
      if(String(metadata?.[key] ?? "")!==String(catalogEntry?.[key] ?? "")){
        errors.push("product metadata "+key+" differs from catalog entry");
      }
    }

    return result(errors,warnings);
  };

  api.validateFormatCatalog=function(catalog={}, productId){
    const errors=[],warnings=[];
    if(catalog.product_id!==productId) errors.push("format catalog product_id mismatch");
    if(!Array.isArray(catalog.formats) || !catalog.formats.length) {
      errors.push("format catalog has no formats");
      return result(errors,warnings);
    }

    const requiredAnalysisKeys=[
      "ev_data",
      "ev_scope_data",
      "base_checklist_data",
      "autograph_checklist_data",
      "player_index_data",
      "player_probability_data",
      "team_autograph_probability_data",
      "team_insert_probability_data",
      "team_base_parallel_probability_data",
      "live_supply_data",
      "sealed_supply_data",
      "production_estimate_data",
      "market_evidence_registry_data",
      "player_derivation_manifest_data"
    ];

    const allowedStatuses=new Set(["ready","pending"]);
    const ids=[];
    let readyCount=0;
    let pendingCount=0;

    for(const format of catalog.formats){
      if(typeof format?.id!=="string" || !format.id){
        errors.push("format id missing");
        continue;
      }
      ids.push(format.id);

      if(!allowedStatuses.has(format.status)){
        errors.push("invalid format status: "+format.id);
      }

      if(typeof format.name!=="string" || !format.name){
        errors.push("format name missing: "+format.id);
      }

      if(format.status==="ready"){
        readyCount++;

        if(!format.analysis_data || typeof format.analysis_data!=="object"){
          errors.push("ready format "+format.id+" lacks analysis_data");
        }else{
          for(const key of requiredAnalysisKeys){
            if(typeof format.analysis_data[key]!=="string" || !format.analysis_data[key]){
              errors.push("ready format "+format.id+" lacks analysis route "+key);
            }
          }
        }

        if(typeof format.integrity_data!=="string" || !format.integrity_data){
          errors.push("ready format "+format.id+" lacks integrity_data");
        }

        const allocation=format.break_allocation_policy||{};
        if(allocation.status!=="protected"){
          errors.push("ready format "+format.id+" break allocation policy must be protected");
        }
        if(allocation.single_team_rule!=="listed-team"){
          errors.push("ready format "+format.id+" single-team allocation rule invalid");
        }
        if(allocation.multi_team_rule!=="exclude-until-explicit-break-rule"){
          errors.push("ready format "+format.id+" multi-team allocation rule invalid");
        }
        if(allocation.ev_treatment!=="exclude-unallocated-multi-team-cards"){
          errors.push("ready format "+format.id+" EV allocation treatment invalid");
        }

        const config=format.configuration||{};
        for(const key of ["boxes_per_case","packs_per_box","cards_per_pack"]){
          if(!finite(config[key]) || Number(config[key])<=0){
            errors.push("ready format "+format.id+" has invalid configuration "+key);
          }
        }

        const unit=format.analysis_unit||{};
        if(unit.type!=="case"){
          errors.push("ready format "+format.id+" analysis unit must be case");
        }
        if(typeof unit.display_name!=="string" || !unit.display_name){
          errors.push("ready format "+format.id+" analysis unit display_name missing");
        }

        const expectedBoxes=Number(config.boxes_per_case);
        const expectedPacks=expectedBoxes*Number(config.packs_per_box);
        const expectedCards=expectedPacks*Number(config.cards_per_pack);

        if(Number(unit.cases)!==1){
          errors.push("ready format "+format.id+" analysis unit cases must equal 1");
        }
        if(Number(unit.boxes)!==expectedBoxes){
          errors.push("ready format "+format.id+" analysis unit boxes mismatch");
        }
        if(Number(unit.packs)!==expectedPacks){
          errors.push("ready format "+format.id+" analysis unit packs mismatch");
        }
        if(Number(unit.cards)!==expectedCards){
          errors.push("ready format "+format.id+" analysis unit cards mismatch");
        }
      }

      if(format.status==="pending"){
        pendingCount++;
        if(format.analysis_data!==null){
          errors.push("pending format "+format.id+" must have null analysis_data");
        }
        if(format.integrity_data!==null){
          errors.push("pending format "+format.id+" must have null integrity_data");
        }
      }
    }

    if(!uniqueStrings(ids)) errors.push("format ids are not unique");
    if(!readyCount) warnings.push("no ready formats");

    return result(errors,warnings,{
      format_count:catalog.formats.length,
      ready_format_count:readyCount,
      pending_format_count:pendingCount,
      required_analysis_route_count:requiredAnalysisKeys.length
    });
  };

  api.validatePlayerDerivationManifest=function(
    manifest={},
    productId,
    formatId,
    analysisData={},
    analysisUnit={}
  ){
    const errors=[],warnings=[];

    if(manifest.schema_version!==1){
      errors.push("player derivation manifest schema_version mismatch");
    }
    if(manifest.product_id!==productId){
      errors.push("player derivation manifest product_id mismatch");
    }
    if(manifest.format_id!==formatId){
      errors.push("player derivation manifest format_id mismatch");
    }
    if(manifest.generator!=="src/playerDerivation.js"){
      errors.push("player derivation generator path mismatch");
    }
    if(!Number.isInteger(Number(manifest.generator_version)) ||
       Number(manifest.generator_version)<1){
      errors.push("player derivation generator_version invalid");
    }

    const requiredInputs=[
      "base_checklist",
      "main_autograph_checklist",
      "hobby_insert_checklist",
      "hobby_special_autograph_checklist",
      "official_hobby_odds",
      "insert_odds_mapping",
      "autograph_odds_mapping"
    ];

    for(const key of requiredInputs){
      if(typeof manifest.inputs?.[key]!=="string" || !manifest.inputs[key]){
        errors.push("player derivation manifest input missing: "+key);
      }
    }

    if(manifest.outputs?.player_index!==analysisData.player_index_data){
      errors.push("player derivation player_index output route mismatch");
    }
    if(manifest.outputs?.player_probabilities!==analysisData.player_probability_data){
      errors.push("player derivation player_probability output route mismatch");
    }

    if(Number(manifest.constants?.boxes_per_case)!==Number(analysisUnit.boxes)){
      errors.push("player derivation boxes_per_case mismatch");
    }
    if(Number(manifest.constants?.packs_per_case)!==Number(analysisUnit.packs)){
      errors.push("player derivation packs_per_case mismatch");
    }

    const calculatedPacks=
      Number(manifest.constants?.boxes_per_case) *
      Number(manifest.constants?.packs_per_box);

    if(calculatedPacks!==Number(manifest.constants?.packs_per_case)){
      errors.push("player derivation pack math mismatch");
    }

    return result(errors,warnings,{
      player_derivation_input_count:requiredInputs.length,
      player_derivation_generator_version:
        Number(manifest.generator_version||0)
    });
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

  api.validateEvScope=function(data={}, productId, formatId, canonicalTeams=[], evData={}){
    const errors=[],warnings=[];
    const requiredCategories=["base_parallels","inserts","autographs"];
    const allowedStatuses=new Set(["not-started","partial","complete"]);

    if(data.schema_version!==1) errors.push("EV scope schema_version mismatch");
    if(data.product_id!==productId) errors.push("EV scope product_id mismatch");
    if(formatId && data.format_id!==formatId) errors.push("EV scope format_id mismatch");
    if(data.model!=="team-ev-scope-v1") errors.push("EV scope model mismatch");
    if(typeof data.scope_definition!=="string" || !data.scope_definition) {
      errors.push("EV scope definition missing");
    }

    if(!Array.isArray(data.required_categories) ||
       data.required_categories.length!==requiredCategories.length ||
       requiredCategories.some(category=>!data.required_categories.includes(category))){
      errors.push("EV scope required categories mismatch");
    }

    if(!data.teams || Array.isArray(data.teams)){
      errors.push("EV scope teams object missing");
      return result(errors,warnings);
    }

    const canonical=[...canonicalTeams].sort();
    const actual=Object.keys(data.teams).sort();
    if(canonical.length!==actual.length ||
       canonical.some((team,index)=>team!==actual[index])){
      errors.push("EV scope canonical team set mismatch");
    }

    let completeTeams=0;
    let partialTeams=0;

    for(const team of canonical){
      const row=data.teams?.[team];
      if(!row) continue;

      let valuedCount=0;
      let allComplete=true;
      let anyProgress=false;

      for(const category of requiredCategories){
        const item=row.categories?.[category];
        if(!item){
          errors.push("EV scope category missing: "+team+" / "+category);
          allComplete=false;
          continue;
        }
        if(!allowedStatuses.has(item.status)){
          errors.push("EV scope category status invalid: "+team+" / "+category);
        }
        if(!nonNegative(item.valued_contribution_count)){
          errors.push("EV scope contribution count invalid: "+team+" / "+category);
        }
        const count=Number(item.valued_contribution_count||0);
        valuedCount+=count;
        if(item.status!=="complete") allComplete=false;
        if(item.status!=="not-started" || count>0) anyProgress=true;
        if(item.status==="not-started" && count!==0){
          errors.push("EV scope not-started category has valued contributions: "+team+" / "+category);
        }
      }

      if(Boolean(row.coverage_complete)!==allComplete){
        errors.push("EV scope team completion mismatch: "+team);
      }
      if(row.coverage_complete) completeTeams++;
      else if(anyProgress) partialTeams++;

      const evRow=evData?.teams?.[team] || null;
      const evValued=Number(evRow?.valued_card_count||0);
      if(valuedCount!==evValued){
        errors.push("EV scope valued contribution count mismatch: "+team);
      }
      if(Boolean(row.coverage_complete)!==Boolean(evRow?.coverage_complete)){
        errors.push("EV scope / team EV completion mismatch: "+team);
      }
    }

    return result(errors,warnings,{
      ev_scope_team_count:actual.length,
      ev_scope_partial_team_count:partialTeams,
      ev_scope_complete_team_count:completeTeams
    });
  };

  api.validateTeamEv=function(data={}, productId, canonicalTeams=[]){
    const errors=[],warnings=[];
    if(data.product_id!==productId) errors.push("team EV product_id mismatch");
    const canonical=new Set(canonicalTeams);
    let contributions=0;
    for(const [team,row] of Object.entries(data.teams||{})){
      if(!canonical.has(team)) errors.push("team EV unknown team: "+team);
      if(!nonNegative(row?.partial_ev_usd)) errors.push("invalid partial EV for "+team);
      if(row?.coverage_complete===true &&
         (typeof row?.coverage_definition!=="string" || !row.coverage_definition)){
        errors.push("complete EV missing coverage_definition for "+team);
      }
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

  api.validateMarketRegistry=function(registry={}, productId, canonicalTeams=[], evData={}, formatId=null){
    const errors=[],warnings=[];
    if(registry.product_id!==productId) errors.push("market registry product_id mismatch");
    if(formatId && registry.format_id!==formatId) errors.push("market registry format_id mismatch");
    if(!registry.teams || Array.isArray(registry.teams)) {
      errors.push("market registry teams object missing");
      return result(errors,warnings);
    }

    const canonical=[...canonicalTeams].sort();
    const registryTeams=Object.keys(registry.teams).sort();

    if(canonical.length!==registryTeams.length ||
       canonical.some((team,index)=>team!==registryTeams[index])) {
      errors.push("market registry canonical team set mismatch");
    }

    let auditedTeams=0;
    let roiEligibleTeams=0;

    for(const team of canonical){
      const entry=registry.teams?.[team];
      if(!entry) continue;

      const evRow=evData?.teams?.[team] || null;
      const evContributions=evRow?.contributions || [];
      const registryKeys=[...(entry.contribution_keys||[])].sort();
      const evKeys=evContributions
        .map(item=>item.card_id+"|"+item.market_source_file)
        .sort();

      if(entry.status!=="not-audited") auditedTeams++;
      if(entry.roi_eligible===true) roiEligibleTeams++;

      if(typeof entry.roi_eligible!=="boolean") {
        errors.push("market registry roi_eligible must be boolean for "+team);
      }

      if(Boolean(entry.ev_present)!==Boolean(evRow)) {
        errors.push("market registry ev_present mismatch for "+team);
      }

      if(entry.status==="not-audited"){
        if(entry.audit_data!==null) errors.push("unaudited team has audit_data: "+team);
        if(registryKeys.length) errors.push("unaudited team has contribution keys: "+team);
        if(entry.roi_eligible===true) errors.push("unaudited team is ROI eligible: "+team);
      }else{
        if(typeof entry.audit_data!=="string" || !entry.audit_data) {
          errors.push("audited team missing audit_data: "+team);
        }
        if(!evRow) errors.push("audited team missing EV row: "+team);
        if(registryKeys.length!==evKeys.length ||
           registryKeys.some((key,index)=>key!==evKeys[index])) {
          errors.push("market registry / EV snapshot mismatch for "+team);
        }
        if(Number(entry.audited_contribution_count)!==evKeys.length) {
          errors.push("market registry audited contribution count mismatch for "+team);
        }
      }

      if(evContributions.length && entry.status==="not-audited") {
        errors.push("EV team lacks market audit: "+team);
      }
    }

    if(Number(registry.summary?.canonical_team_count)!==canonical.length) {
      errors.push("market registry canonical team count mismatch");
    }

    return result(errors,warnings,{
      market_registry_team_count:registryTeams.length,
      market_registry_audited_team_count:auditedTeams,
      market_registry_roi_eligible_team_count:roiEligibleTeams
    });
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
      context.catalogEntry
        ? api.validateProductMetadataAgainstCatalog(
            bundle.metadata,
            context.catalogEntry
          )
        : null,
      api.validateBaseChecklist(bundle.baseChecklist,productId,canonical),
      api.validateAutographChecklist(bundle.autographChecklist,productId,canonical),
      api.validatePlayerIndex(bundle.playerIndex,productId,canonical),
      api.validatePlayerProbabilities(bundle.playerProbabilities,productId,canonical),
      api.validatePlayerDerivationManifest(
        bundle.playerDerivationManifest,
        productId,
        context.formatId || null,
        context.analysisData || {},
        context.analysisUnit || {}
      ),
      api.validateTeamProbabilityDataset(bundle.autographProbabilities,productId,canonical,"autograph probability"),
      api.validateTeamProbabilityDataset(bundle.insertProbabilities,productId,canonical,"insert probability"),
      api.validateTeamProbabilityDataset(bundle.baseParallelProbabilities,productId,canonical,"base parallel probability"),
      api.validateSupplyDataset(bundle.liveSupply,productId,canonical,"live supply"),
      api.validateProductId(bundle.sealedSupply,productId,"sealed supply"),
      api.validateProductId(bundle.production,productId,"production estimate"),
      api.validateTeamEv(bundle.teamEv,productId,canonical),
      api.validateEvScope(
        bundle.evScope,
        productId,
        context.formatId || null,
        canonical,
        bundle.teamEv
      ),
      api.validateMarketRegistry(
        bundle.marketRegistry,
        productId,
        canonical,
        bundle.teamEv,
        context.formatId || null
      )
    ];
    return merge(results);
  };

  api.reconcileProduct=function(catalog={},storedProduct){
    const products=catalog.products||[];
    if(products.some(x=>x.id===storedProduct)) return storedProduct;
    return products.find(x=>x.status==="ready")?.id || products[0]?.id || null;
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
