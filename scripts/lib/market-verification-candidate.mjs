import {
  assessListingIdentity
} from "./market-card-identity.mjs";
import {
  hasOriginalLocator,
  validateEvidence,
  utcDateFromOffsetTimestamp
} from "./market-verification-evidence.mjs";

function text(value){
  return typeof value==="string" ? value.trim() : "";
}

function validDate(value){
  return typeof value==="string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(new Date(value+"T00:00:00Z").getTime());
}

function moneyMatches(a,b){
  const x=Number(a);
  const y=Number(b);
  return Number.isFinite(x) &&
    Number.isFinite(y) &&
    Math.abs(x-y)<=0.005;
}

export function assessVerificationCandidate({
  task={},
  record={},
  product={},
  candidate={}
}={}){
  const errors=[];
  const blockers=[];

  if(candidate.schema_version!==1){
    errors.push("candidate schema_version must be 1");
  }
  if(!text(candidate.task_id) || candidate.task_id!==task.task_id){
    errors.push("candidate task_id does not match verification task");
  }
  if(
    !text(candidate.product_id) ||
    candidate.product_id!==record.product_id ||
    candidate.product_id!==product.id
  ){
    errors.push("candidate product_id does not match target product");
  }
  if(
    !text(candidate.market_source_file) ||
    candidate.market_source_file!==task.market_source_file
  ){
    errors.push("candidate market_source_file does not match task");
  }
  if(Number(candidate.sale_index)!==Number(task.sale_index)){
    errors.push("candidate sale_index does not match task");
  }

  const sale=record.sales?.[Number(task.sale_index)];
  if(!sale){
    errors.push("candidate sale_index does not resolve to market record sale");
    return {
      valid:false,
      status:"invalid-candidate",
      eligible_for_evidence:false,
      errors,
      blockers
    };
  }

  if(errors.length){
    return {
      valid:false,
      status:"invalid-candidate",
      eligible_for_evidence:false,
      errors,
      blockers
    };
  }

  const identity=assessListingIdentity({
    record,
    product,
    listing:candidate.listing_identity||{}
  });

  if(!identity.valid){
    return {
      valid:true,
      status:"identity-mismatch",
      eligible_for_evidence:false,
      errors:[],
      blockers:identity.errors,
      identity
    };
  }

  const candidateMarketplace=text(candidate.marketplace);
  if(
    candidateMarketplace.toLowerCase()!==
    text(sale.marketplace).toLowerCase()
  ){
    blockers.push("candidate marketplace does not match stored sale marketplace");
  }

  if(!hasOriginalLocator(candidate,sale.marketplace)){
    blockers.push("candidate has no qualifying original marketplace locator");
  }

  const observed=candidate.observed_sale||{};
  const identitySourceKind=text(candidate.identity_source_kind).toLowerCase();
  const eventSourceKind=text(observed.source_kind).toLowerCase();

  const endedAt=text(observed.original_marketplace_ended_at);
  const saleDateBasis=text(observed.sale_date_basis);
  const timestampDateMatches=
    !endedAt ||
    (
      saleDateBasis==="utc-date-from-original-marketplace-timestamp" &&
      utcDateFromOffsetTimestamp(endedAt)===observed.sale_date
    );

  const eventChecks={
    identity_original_source:
      identitySourceKind==="original-marketplace",
    listing_state:
      text(candidate.listing_state).toLowerCase()==="sold",
    sale_date:
      validDate(observed.sale_date) &&
      observed.sale_date===sale.sale_date &&
      timestampDateMatches,
    sale_price:
      moneyMatches(observed.sale_price_usd,sale.sale_price),
    marketplace:
      text(observed.marketplace).toLowerCase()===
      text(sale.marketplace).toLowerCase(),
    serial_copy:
      text(sale.serial_copy)
        ? text(observed.serial_copy)===text(sale.serial_copy)
        : true,
    sale_event_original_source:
      eventSourceKind==="original-marketplace"
  };

  if(!eventChecks.identity_original_source){
    blockers.push("candidate card identity is not observed from original marketplace");
  }
  if(!eventChecks.listing_state){
    blockers.push("candidate listing is not confirmed as a sold listing");
  }
  if(!eventChecks.sale_date){
    blockers.push("candidate sold date does not match stored realized sale");
    if(endedAt && !timestampDateMatches){
      blockers.push(
        "candidate original marketplace timestamp does not normalize to observed sale date"
      );
    }
  }
  if(!eventChecks.sale_price){
    blockers.push("candidate sold price does not match stored realized sale");
  }
  if(!eventChecks.marketplace){
    blockers.push("candidate observed marketplace does not match stored sale");
  }
  if(!eventChecks.serial_copy){
    blockers.push("candidate serial copy does not match stored realized sale");
  }
  if(!eventChecks.sale_event_original_source){
    blockers.push("candidate sale event is not observed from original marketplace");
  }

  const eventMatched=
    Object.values(eventChecks).every(Boolean) &&
    blockers.length===0;

  return {
    valid:true,
    status:eventMatched
      ? "historical-sale-match"
      : "identity-match-sale-unresolved",
    eligible_for_evidence:eventMatched,
    errors:[],
    blockers,
    identity,
    event_checks:eventChecks
  };
}

export function evidenceFromCandidate({
  task={},
  record={},
  product={},
  candidate={},
  verifiedAt=""
}={}){
  const assessment=assessVerificationCandidate({
    task,
    record,
    product,
    candidate
  });

  if(!assessment.eligible_for_evidence){
    return {
      created:false,
      assessment,
      evidence:null
    };
  }

  const sale=record.sales[Number(task.sale_index)];
  const observed=candidate.observed_sale||{};
  const evidence={
    schema_version:2,
    task_id:task.task_id,
    product_id:record.product_id,
    market_source_file:task.market_source_file,
    sale_index:Number(task.sale_index),
    card_id:task.card_id,
    player:task.player,
    set:task.set,
    parallel:task.parallel,
    sale_date:sale.sale_date,
    sale_price_usd:Number(sale.sale_price),
    marketplace:sale.marketplace,
    serial_copy:sale.serial_copy||null,
    listing_identity:{
      series:text(candidate.listing_identity?.series),
      card_number:text(candidate.listing_identity?.card_number),
      parallel:text(candidate.listing_identity?.parallel),
      print_run:
        candidate.listing_identity?.print_run===null ||
        candidate.listing_identity?.print_run===undefined ||
        candidate.listing_identity?.print_run===""
          ? null
          : Number(candidate.listing_identity.print_run),
      player:text(candidate.listing_identity?.player),
      team:text(candidate.listing_identity?.team)||""
    },
    direct_marketplace_url:text(candidate.direct_marketplace_url),
    source_sale_id:text(candidate.source_sale_id),
    verified_at:text(verifiedAt || candidate.checked_at),
    original_marketplace_ended_at:endedAt,
    sale_date_basis:saleDateBasis,
    verification_note:text(candidate.research_note) ||
      "Promoted from an exact historical-sale candidate."
  };

  if(!evidence.direct_marketplace_url){
    delete evidence.direct_marketplace_url;
  }
  if(!evidence.source_sale_id){
    delete evidence.source_sale_id;
  }
  if(!evidence.original_marketplace_ended_at){
    delete evidence.original_marketplace_ended_at;
  }
  if(!evidence.sale_date_basis){
    delete evidence.sale_date_basis;
  }

  const validation=validateEvidence({
    task,
    record,
    product,
    evidence
  });
  if(!validation.valid){
    return {
      created:false,
      assessment:{
        ...assessment,
        status:"candidate-evidence-invalid",
        eligible_for_evidence:false,
        blockers:validation.errors
      },
      evidence:null
    };
  }

  return {
    created:true,
    assessment,
    evidence
  };
}
