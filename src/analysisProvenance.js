// BreakMetric analysis provenance v1.
// Builds user-visible provenance from the active runtime bundle.

(function(root){
  "use strict";

  const api={};

  function stringValue(value,fallback="—"){
    return typeof value==="string" && value ? value : fallback;
  }

  api.build=function(bundle={},context={}){
    const team=context.team || null;
    const player=context.player || null;
    const format=context.format || {};
    const derivation=bundle.playerDerivationManifest || {};
    const registryEntry=team ? bundle.marketRegistry?.teams?.[team] || null : null;
    const teamEv=team ? bundle.teamEv?.teams?.[team] || null : null;
    const playerProbability=
      team && player
        ? bundle.playerProbabilities?.teams?.[team]?.[player] || null
        : null;

    return {
      product:{
        product_id:stringValue(context.productId),
        display_name:stringValue(bundle.metadata?.display_name)
      },
      format:{
        format_id:stringValue(context.formatId),
        name:stringValue(format.name),
        analysis_unit:stringValue(format.analysis_unit?.display_name),
        boxes:Number(format.analysis_unit?.boxes || 0),
        packs:Number(format.analysis_unit?.packs || 0),
        cards:Number(format.analysis_unit?.cards || 0),
        allocation_policy_status:stringValue(format.break_allocation_policy?.status),
        multi_team_rule:stringValue(format.break_allocation_policy?.multi_team_rule),
        ev_allocation_treatment:stringValue(format.break_allocation_policy?.ev_treatment)
      },
      probability:{
        source_type:"manufacturer-published odds + normalized checklist mapping",
        player_generator:stringValue(derivation.generator),
        player_generator_version:Number(derivation.generator_version || 0),
        input_count:Object.keys(derivation.inputs || {}).length,
        input_paths:Object.values(derivation.inputs || {}),
        player_probability_available:Boolean(playerProbability),
        player_probability_coverage_percent:
          playerProbability
            ? Number(playerProbability?.coverage?.coverage_percent || 0)
            : null
      },
      ev:{
        team:team,
        status:teamEv?.ev_status || (teamEv ? "available" : "not-valued"),
        coverage_complete:teamEv?.coverage_complete===true,
        valued_card_count:Number(teamEv?.valued_card_count || 0),
        market_status:registryEntry?.market_evidence_status || "none",
        market_audited:Boolean(
          registryEntry && registryEntry.status!=="not-audited"
        ),
        original_verified_count:Number(
          registryEntry?.original_marketplace_verified_contribution_count || 0
        ),
        roi_eligible:registryEntry?.roi_eligible===true
      },
      selected:{
        team,
        player
      }
    };
  };

  api.validate=function(provenance={}){
    const errors=[];

    if(!provenance.product?.product_id || provenance.product.product_id==="—"){
      errors.push("provenance product_id missing");
    }
    if(!provenance.format?.format_id || provenance.format.format_id==="—"){
      errors.push("provenance format_id missing");
    }
    if(!provenance.format?.analysis_unit || provenance.format.analysis_unit==="—"){
      errors.push("provenance analysis unit missing");
    }
    if(!Number.isFinite(Number(provenance.format?.packs)) ||
       Number(provenance.format.packs)<=0){
      errors.push("provenance pack count invalid");
    }
    if(provenance.format?.allocation_policy_status!=="protected"){
      errors.push("provenance break allocation policy not protected");
    }
    if(provenance.format?.multi_team_rule!=="exclude-until-explicit-break-rule"){
      errors.push("provenance multi-team allocation rule invalid");
    }
    if(provenance.format?.ev_allocation_treatment!=="exclude-unallocated-multi-team-cards"){
      errors.push("provenance EV allocation treatment invalid");
    }
    if(!provenance.probability?.player_generator ||
       provenance.probability.player_generator==="—"){
      errors.push("provenance player generator missing");
    }
    if(!Number.isInteger(Number(provenance.probability?.player_generator_version)) ||
       Number(provenance.probability.player_generator_version)<1){
      errors.push("provenance generator version invalid");
    }
    if(Number(provenance.probability?.input_count)<1){
      errors.push("provenance input list missing");
    }
    if(provenance.ev?.roi_eligible && !provenance.ev?.coverage_complete){
      errors.push("ROI eligible provenance has incomplete EV coverage");
    }
    if(provenance.ev?.roi_eligible && !provenance.ev?.market_audited){
      errors.push("ROI eligible provenance lacks market audit");
    }

    return {
      valid:errors.length===0,
      errors
    };
  };

  api.summaryLines=function(provenance={}){
    const probability=provenance.probability || {};
    const ev=provenance.ev || {};
    const format=provenance.format || {};

    return [
      {
        label:"Probability model",
        value:
          stringValue(probability.player_generator) +
          " v" + Number(probability.player_generator_version || 0) +
          " · " + Number(probability.input_count || 0) + " source inputs"
      },
      {
        label:"Analysis unit",
        value:
          stringValue(format.analysis_unit) +
          " · " + Number(format.packs || 0) + " packs"
      },
      {
        label:"Break allocation",
        value:
          format.multi_team_rule==="exclude-until-explicit-break-rule"
            ? "Single-team mapped · multi-team excluded from team EV"
            : stringValue(format.multi_team_rule)
      },
      {
        label:"EV evidence",
        value:
          ev.status==="not-valued"
            ? "Not valued"
            : ev.market_status==="secondary-source-only"
              ? "Provisional · secondary-source market comps"
              : ev.market_status==="original-marketplace-verified"
                ? "Original marketplace verified"
                : ev.market_audited
                  ? "Audited market evidence"
                  : "Market audit pending"
      },
      {
        label:"ROI gate",
        value:ev.roi_eligible ? "Eligible" : "Locked"
      }
    ];
  };

  root.BreakMetricProvenance=Object.freeze(api);
})(typeof window!=="undefined" ? window : globalThis);
