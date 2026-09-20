// BreakMetric team analysis readiness v1.
// Derived only from already-loaded product/format datasets.

(function(root){
  "use strict";

  const api={};

  function teamArrayHas(data,team){
    return Array.isArray(data?.teams) &&
      data.teams.some(row=>row?.team===team);
  }

  function teamPlayerProbabilityReady(data,team){
    const rows=data?.teams?.[team];
    if(!rows || Array.isArray(rows)) return false;
    const players=Object.values(rows);
    if(!players.length) return false;
    return players.every(row=>
      Number.isFinite(Number(row?.coverage?.coverage_percent)) &&
      Number(row.coverage.coverage_percent) >= 0 &&
      Number(row.coverage.coverage_percent) <= 100
    );
  }

  function autographChecklistCount(data,team){
    return Number(data?.team_counts?.[team] || 0);
  }

  api.buildTeamReadiness=function(bundle={}){
    const teams=(bundle.metadata?.teams||[])
      .map(item=>item?.name)
      .filter(Boolean);

    const result={};

    for(const team of teams){
      const autoChecklistCount=autographChecklistCount(
        bundle.autographChecklist,
        team
      );

      const baseProbabilityReady=teamArrayHas(
        bundle.baseParallelProbabilities,
        team
      );
      const insertProbabilityReady=teamArrayHas(
        bundle.insertProbabilities,
        team
      );
      const autographProbabilityReady=
        autoChecklistCount===0 ||
        teamArrayHas(bundle.autographProbabilities,team);
      const playerProbabilityReady=teamPlayerProbabilityReady(
        bundle.playerProbabilities,
        team
      );

      const probabilityReady=
        baseProbabilityReady &&
        insertProbabilityReady &&
        autographProbabilityReady &&
        playerProbabilityReady;

      const ev=bundle.teamEv?.teams?.[team] || null;
      const evStatus=!ev
        ? "not-valued"
        : ev.coverage_complete
          ? "complete"
          : "partial";

      const market=bundle.marketRegistry?.teams?.[team] || null;
      const marketStatus=!market || market.status==="not-audited"
        ? "not-audited"
        : market.market_evidence_status==="original-marketplace-verified"
          ? "original-verified"
          : market.market_evidence_status==="secondary-source-only"
            ? "secondary-source"
            : market.market_evidence_status==="mixed"
              ? "mixed"
              : "audited";

      const roiEligible=
        Boolean(ev?.coverage_complete) &&
        market?.roi_eligible===true;

      const overallStatus=roiEligible
        ? "decision-ready"
        : evStatus==="complete"
          ? "roi-locked"
          : evStatus==="partial"
            ? "ev-partial"
            : probabilityReady
              ? "probability-ready"
              : "incomplete";

      result[team]={
        team,
        probability:{
          status:probabilityReady ? "ready" : "incomplete",
          ready:probabilityReady,
          player_probability_ready:playerProbabilityReady,
          base_parallel_ready:baseProbabilityReady,
          insert_ready:insertProbabilityReady,
          autograph_ready:autographProbabilityReady,
          autograph_checklist_count:autoChecklistCount
        },
        ev:{
          status:evStatus,
          valued_card_count:Number(ev?.valued_card_count || 0),
          coverage_complete:ev?.coverage_complete===true,
          indicative:ev?.ev_status==="indicative-provisional"
        },
        market:{
          status:marketStatus,
          audited:Boolean(market && market.status!=="not-audited"),
          original_verified_count:Number(
            market?.original_marketplace_verified_contribution_count || 0
          ),
          audited_contribution_count:Number(
            market?.audited_contribution_count || 0
          )
        },
        roi:{
          eligible:roiEligible,
          status:roiEligible ? "ready" : "locked"
        },
        overall_status:overallStatus
      };
    }

    return result;
  };

  api.summary=function(readiness={}){
    const rows=Object.values(readiness);
    const count=status=>rows.filter(row=>row.overall_status===status).length;
    return {
      team_count:rows.length,
      probability_ready_count:rows.filter(row=>row.probability.ready).length,
      ev_partial_count:rows.filter(row=>row.ev.status==="partial").length,
      ev_complete_count:rows.filter(row=>row.ev.status==="complete").length,
      market_audited_count:rows.filter(row=>row.market.audited).length,
      roi_ready_count:rows.filter(row=>row.roi.eligible).length,
      overall:{
        decision_ready:count("decision-ready"),
        roi_locked:count("roi-locked"),
        ev_partial:count("ev-partial"),
        probability_ready:count("probability-ready"),
        incomplete:count("incomplete")
      }
    };
  };

  api.validate=function(readiness={},canonicalTeams=[]){
    const errors=[];
    const expected=[...canonicalTeams].sort();
    const actual=Object.keys(readiness).sort();

    if(expected.length!==actual.length ||
       expected.some((team,index)=>team!==actual[index])){
      errors.push("readiness canonical team set mismatch");
    }

    for(const team of expected){
      const row=readiness[team];
      if(!row) continue;
      if(!["ready","incomplete"].includes(row.probability?.status)){
        errors.push("invalid probability readiness for "+team);
      }
      if(!["not-valued","partial","complete"].includes(row.ev?.status)){
        errors.push("invalid EV readiness for "+team);
      }
      if(!["not-audited","secondary-source","original-verified","mixed","audited"].includes(row.market?.status)){
        errors.push("invalid market readiness for "+team);
      }
      if(!["ready","locked"].includes(row.roi?.status)){
        errors.push("invalid ROI readiness for "+team);
      }
      if(row.roi?.eligible && !row.ev?.coverage_complete){
        errors.push("ROI-ready team lacks complete EV coverage: "+team);
      }
      if(row.roi?.eligible && !row.market?.audited){
        errors.push("ROI-ready team lacks audited market evidence: "+team);
      }
    }

    return {
      valid:errors.length===0,
      errors,
      summary:api.summary(readiness)
    };
  };

  api.labels=function(row={}){
    return {
      probability:row.probability?.ready
        ? "Probability ready"
        : "Probability incomplete",
      ev:row.ev?.status==="complete"
        ? "EV complete"
        : row.ev?.status==="partial"
          ? "EV partial"
          : "EV not valued",
      market:row.market?.status==="original-verified"
        ? "Market verified"
        : row.market?.status==="secondary-source"
          ? "Market secondary"
          : row.market?.status==="mixed"
            ? "Market mixed"
            : row.market?.audited
              ? "Market audited"
              : "Market not audited",
      roi:row.roi?.eligible ? "ROI ready" : "ROI locked"
    };
  };

  root.BreakMetricTeamReadiness=Object.freeze(api);
})(typeof window!=="undefined" ? window : globalThis);
