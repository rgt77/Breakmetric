import assert from "node:assert/strict";
import {
  assessVerificationCandidate,
  evidenceFromCandidate
} from "./lib/market-verification-candidate.mjs";

const product={
  id:"2026-topps-chrome-premier-league",
  market_identity:{
    accepted_series_aliases:[
      "2026 Topps Chrome Premier League",
      "2025-26 Topps Chrome Premier League",
      "2025/26 Topps Chrome Premier League"
    ]
  }
};

const task={
  task_id:"product::hobby::Chelsea::CA-EV-gold-refractor-auto::0",
  contribution_priority_rank:1,
  sale_index:0,
  product_id:product.id,
  card_number:"CA-EV",
  serial_numbering:50,
  team:"Chelsea",
  card_id:"CA-EV-gold-refractor-auto",
  player:"Estêvão Willian",
  set:"Chrome Autograph Cards",
  parallel:"Gold Refractor",
  ev_contribution_usd:15.1,
  market_source_file:"data/market/example.json",
  sale_date:"2026-02-07",
  sale_price_usd:2000,
  marketplace:"eBay",
  serial_copy:"14/50"
};

const record={
  schema_version:2,
  product_id:product.id,
  card_number:"CA-EV",
  serial_numbering:50,
  team:"Chelsea",
  player:"Estêvão Willian",
  set:"Chrome Autograph Cards",
  parallel:"Gold Refractor",
  sales:[
    {
      sale_date:"2026-02-07",
      sale_price:2000,
      marketplace:"eBay",
      serial_copy:"14/50",
      evidence_status:"secondary-source-realized-sale",
      original_marketplace_verified:false
    }
  ]
};

const base={
  schema_version:1,
  task_id:task.task_id,
  product_id:product.id,
  market_source_file:task.market_source_file,
  sale_index:0,
  marketplace:"eBay",
  listing_state:"sold",
  identity_source_kind:"original-marketplace",
  direct_marketplace_url:"https://www.ebay.com/itm/123456789012",
  checked_at:"2026-09-21",
  listing_identity:{
    series:"2025-26 Topps Chrome Premier League",
    card_number:"CA-EV",
    parallel:"Gold Refractor",
    print_run:50,
    player:"Estêvão Willian",
    team:"Chelsea"
  },
  observed_sale:{
    source_kind:"original-marketplace",
    sale_date:"2026-02-07",
    sale_price_usd:2000,
    marketplace:"eBay",
    serial_copy:"14/50"
  },
  research_note:"Synthetic exact-match fixture."
};

const exact=assessVerificationCandidate({
  task,
  record,
  product,
  candidate:base
});
assert.equal(exact.valid,true);
assert.equal(exact.status,"historical-sale-match");
assert.equal(exact.eligible_for_evidence,true);
assert.deepEqual(exact.blockers,[]);

const wrongSeries={
  ...base,
  listing_identity:{
    series:"2025-26 Topps",
    card_number:"AC-ES",
    parallel:"Gold Rainbow",
    print_run:50,
    player:"Estêvão Willian",
    team:"Chelsea"
  }
};
const wrongSeriesAssessment=assessVerificationCandidate({
  task,
  record,
  product,
  candidate:wrongSeries
});
assert.equal(wrongSeriesAssessment.status,"identity-mismatch");
assert.equal(wrongSeriesAssessment.eligible_for_evidence,false);
assert.ok(
  wrongSeriesAssessment.blockers.some(error=>
    error.includes("series does not match target product family")
  )
);

const secondaryOnly={
  ...base,
  identity_source_kind:"secondary-source",
  observed_sale:{
    ...base.observed_sale,
    source_kind:"secondary-source"
  }
};
const secondaryAssessment=assessVerificationCandidate({
  task,
  record,
  product,
  candidate:secondaryOnly
});
assert.equal(
  secondaryAssessment.status,
  "identity-match-sale-unresolved"
);
assert.equal(secondaryAssessment.eligible_for_evidence,false);
assert.ok(
  secondaryAssessment.blockers.some(error=>
    error.includes("card identity is not observed from original marketplace")
  )
);
assert.ok(
  secondaryAssessment.blockers.some(error=>
    error.includes("sale event is not observed from original marketplace")
  )
);

const activeRelisting={
  ...base,
  listing_state:"active",
  observed_sale:{
    sale_date:null,
    sale_price_usd:3499.99,
    marketplace:"eBay",
    serial_copy:"14/50"
  }
};
const relistingAssessment=assessVerificationCandidate({
  task,
  record,
  product,
  candidate:activeRelisting
});
assert.equal(
  relistingAssessment.status,
  "identity-match-sale-unresolved"
);
assert.equal(relistingAssessment.eligible_for_evidence,false);
assert.ok(
  relistingAssessment.blockers.some(error=>
    error.includes("not confirmed as a sold listing")
  )
);

const otherHistoricalSale={
  ...base,
  observed_sale:{
    ...base.observed_sale,
    sale_date:"2026-03-01",
    sale_price_usd:2400
  }
};
const otherSaleAssessment=assessVerificationCandidate({
  task,
  record,
  product,
  candidate:otherHistoricalSale
});
assert.equal(
  otherSaleAssessment.status,
  "identity-match-sale-unresolved"
);
assert.equal(otherSaleAssessment.eligible_for_evidence,false);
assert.ok(
  otherSaleAssessment.blockers.some(error=>
    error.includes("sold date does not match")
  )
);

const promoted=evidenceFromCandidate({
  task,
  record,
  product,
  candidate:base
});
assert.equal(promoted.created,true);
assert.equal(promoted.evidence.schema_version,2);
assert.equal(promoted.evidence.product_id,product.id);
assert.equal(
  promoted.evidence.listing_identity.series,
  "2025-26 Topps Chrome Premier League"
);
assert.equal(promoted.evidence.sale_date,"2026-02-07");
assert.equal(promoted.evidence.sale_price_usd,2000);
assert.equal(promoted.evidence.serial_copy,"14/50");
assert.equal(
  promoted.evidence.direct_marketplace_url,
  "https://www.ebay.com/itm/123456789012"
);

const recordWithoutStoredSerial={
  ...record,
  sales:[
    {
      ...record.sales[0],
      serial_copy:undefined
    }
  ]
};
const observedSerialWithoutStoredSerial={
  ...base,
  observed_sale:{
    ...base.observed_sale,
    serial_copy:"10/50"
  }
};
const observedSerialAssessment=assessVerificationCandidate({
  task,
  record:recordWithoutStoredSerial,
  product,
  candidate:observedSerialWithoutStoredSerial
});
assert.equal(observedSerialAssessment.valid,true);
assert.equal(observedSerialAssessment.event_checks.serial_copy,true);

const badLocator={
  ...base,
  direct_marketplace_url:"https://www.ebay.com/sch/i.html?_nkw=estevao"
};
const rejectedPromotion=evidenceFromCandidate({
  task,
  record,
  product,
  candidate:badLocator
});
assert.equal(rejectedPromotion.created,false);
assert.equal(
  rejectedPromotion.assessment.status,
  "identity-match-sale-unresolved"
);

assert.equal(record.sales[0].original_marketplace_verified,false);
assert.equal(record.sales[0].evidence_status,"secondary-source-realized-sale");

console.log(JSON.stringify({
  result:"pass",
  checks:[
    "exact product identity plus exact sold event becomes historical-sale-match",
    "wrong Topps product family is rejected before sale matching",
    "later active relisting stays unresolved even for the exact physical card",
    "secondary-source-only identity and sale observations stay unresolved",
    "different historical sale event stays unresolved",
    "observed serial may be retained when stored sale has no serial copy",
    "only exact historical-sale-match can be promoted to evidence",
    "candidate assessment never mutates the market record"
  ]
},null,2));
