import assert from "node:assert/strict";
import {
  applyEvidence,
  validateEvidence
} from "./lib/market-verification-evidence.mjs";

const product={
  id:"2026-topps-chrome-premier-league",
  market_identity:{
    canonical_series:"2026 Topps Chrome Premier League",
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
  product_id:"2026-topps-chrome-premier-league",
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
  product_id:"2026-topps-chrome-premier-league",
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
      discovery_source:"SportsCardsPro",
      source_reference:"https://www.sportscardspro.com/example",
      serial_copy:"14/50",
      direct_marketplace_url_recovered:false,
      evidence_status:"secondary-source-realized-sale",
      original_marketplace_verified:false
    },
    {
      sale_date:"2026-02-15",
      sale_price:2800,
      marketplace:"eBay",
      discovery_source:"SportsCardsPro",
      source_reference:"https://www.sportscardspro.com/example",
      serial_copy:"34/50",
      direct_marketplace_url_recovered:false,
      evidence_status:"secondary-source-realized-sale",
      original_marketplace_verified:false
    }
  ],
  calculated_market_value:{
    median_usd:2400,
    sale_count:2,
    status:"provisional-secondary-source"
  },
  evidence_summary:{
    status:"secondary-source-only",
    original_marketplace_verified_sale_count:0,
    secondary_source_realized_sale_count:2,
    discovery_only_sale_count:0
  }
};

const valid={
  schema_version:2,
  product_id:"2026-topps-chrome-premier-league",
  task_id:task.task_id,
  market_source_file:task.market_source_file,
  sale_index:0,
  card_id:task.card_id,
  player:task.player,
  set:task.set,
  parallel:task.parallel,
  sale_date:"2026-02-07",
  sale_price_usd:2000,
  marketplace:"eBay",
  serial_copy:"14/50",
  listing_identity:{
    series:"2025-26 Topps Chrome Premier League",
    card_number:"CA-EV",
    parallel:"Gold Refractor",
    print_run:50,
    player:"Estêvão Willian",
    team:"Chelsea"
  },
  direct_marketplace_url:"https://www.ebay.com/itm/123456789012",
  verified_at:"2026-09-21",
  verification_note:"Recovered original marketplace sale."
};

assert.equal(
  validateEvidence({task,record,product,evidence:valid}).valid,
  true
);

const applied=applyEvidence({task,record,product,evidence:valid});
assert.equal(applied.applied,true);
assert.equal(
  applied.record.sales[0].original_marketplace_verified,
  true
);
assert.equal(
  applied.record.sales[0].evidence_status,
  "original-marketplace-verified"
);
assert.equal(
  applied.record.evidence_summary.original_marketplace_verified_sale_count,
  1
);
assert.equal(
  applied.record.evidence_summary.secondary_source_realized_sale_count,
  1
);
assert.equal(
  applied.record.calculated_market_value.status,
  "provisional-mixed-source"
);
assert.equal(
  applied.contribution_original_marketplace_verified,
  false
);
assert.deepEqual(
  applied.record.sales.map(row=>row.sale_price),
  record.sales.map(row=>row.sale_price)
);

const stableIdOnly={
  ...valid,
  direct_marketplace_url:undefined,
  source_sale_id:"123456789012"
};
assert.equal(
  validateEvidence({
    task,
    record,
    product,
    evidence:stableIdOnly
  }).valid,
  true
);

for(const [name,patch,expected] of [
  [
    "wrong product family despite matching player and serial",
    {
      listing_identity:{
        series:"2025-26 Topps",
        card_number:"AC-ES",
        parallel:"Gold Rainbow",
        print_run:50,
        player:"Estêvão Willian",
        team:"Chelsea"
      }
    },
    "series does not match target product family"
  ],
  [
    "wrong Chrome card number",
    {
      listing_identity:{
        ...valid.listing_identity,
        card_number:"AC-ES"
      }
    },
    "card_number does not match"
  ],
  [
    "wrong Chrome parallel",
    {
      listing_identity:{
        ...valid.listing_identity,
        parallel:"Gold Wave Refractor"
      }
    },
    "parallel does not match"
  ],
  [
    "price mismatch",
    {sale_price_usd:1999},
    "sale_price_usd does not match"
  ],
  [
    "date mismatch",
    {sale_date:"2026-02-08"},
    "sale_date does not match"
  ],
  [
    "serial mismatch",
    {serial_copy:"15/50"},
    "serial_copy does not match"
  ],
  [
    "task mismatch",
    {task_id:"wrong"},
    "task_id does not match"
  ],
  [
    "secondary URL masquerading as original",
    {
      direct_marketplace_url:
        "https://www.sportscardspro.com/example"
    },
    "URL host does not match"
  ],
  [
    "eBay category URL is not a sale locator",
    {
      direct_marketplace_url:
        "https://www.ebay.com/sch/i.html?_nkw=estevao"
    },
    "not a qualifying sale listing"
  ],
  [
    "malformed eBay stable sale id",
    {
      direct_marketplace_url:undefined,
      source_sale_id:"not-an-ebay-item"
    },
    "stable sale id format is not valid"
  ],
  [
    "eBay URL and stable id mismatch",
    {
      direct_marketplace_url:
        "https://www.ebay.com/itm/123456789012",
      source_sale_id:"123456789013"
    },
    "URL and stable sale id disagree"
  ]
]){
  const evidence={...valid,...patch};
  const validation=validateEvidence({task,record,product,evidence});
  assert.equal(validation.valid,false,name+" unexpectedly passed");
  assert.ok(
    validation.errors.some(error=>error.includes(expected)),
    name+" missing expected failure"
  );
  const rejected=applyEvidence({task,record,product,evidence});
  assert.equal(rejected.applied,false);
  assert.deepEqual(rejected.record,record);
}

const singaporeEbay={
  ...valid,
  direct_marketplace_url:"https://www.ebay.com.sg/itm/123456789012"
};
assert.equal(
  validateEvidence({
    task,
    record,
    product,
    evidence:singaporeEbay
  }).valid,
  true
);

const spanishEbay={
  ...valid,
  direct_marketplace_url:"https://www.ebay.es/itm/123456789012"
};
assert.equal(
  validateEvidence({
    task,
    record,
    product,
    evidence:spanishEbay
  }).valid,
  true
);

const unnumberedTask={
  ...task,
  serial_numbering:null
};
const unnumberedRecord={
  ...record,
  serial_numbering:null
};
const unnumberedEvidence={
  ...valid,
  listing_identity:{
    ...valid.listing_identity,
    print_run:null
  }
};
const unnumberedApplied=applyEvidence({
  task:unnumberedTask,
  record:unnumberedRecord,
  product,
  evidence:unnumberedEvidence
});
assert.equal(unnumberedApplied.applied,true);
assert.equal(
  unnumberedApplied.record.sales[0].original_marketplace_identity.print_run,
  null
);

const secondTask={...task,sale_index:1,sale_date:"2026-02-15",sale_price_usd:2800,serial_copy:"34/50",task_id:"product::hobby::Chelsea::CA-EV-gold-refractor-auto::1"};
const secondEvidence={
  ...valid,
  task_id:secondTask.task_id,
  sale_index:1,
  sale_date:"2026-02-15",
  sale_price_usd:2800,
  serial_copy:"34/50",
  direct_marketplace_url:"https://www.ebay.com/itm/987654321012"
};
const afterFirst=applied.record;
const afterSecond=applyEvidence({
  task:secondTask,
  record:afterFirst,
  product,
  evidence:secondEvidence
});
assert.equal(afterSecond.applied,true);
assert.equal(afterSecond.contribution_original_marketplace_verified,true);
assert.equal(
  afterSecond.record.evidence_summary.original_marketplace_verified_sale_count,
  2
);
assert.equal(
  afterSecond.record.calculated_market_value.status,
  "verified-original-marketplace"
);
assert.deepEqual(
  afterSecond.record.sales.map(row=>row.sale_price),
  [2000,2800]
);

console.log(JSON.stringify({
  result:"pass",
  checks:[
    "accepted Chrome product alias passes exact product identity gate",
    "plain Topps Premier League cannot masquerade as Topps Chrome Premier League",
    "wrong card number is rejected even for same player",
    "wrong parallel is rejected even within Chrome",
    "valid original marketplace sale URL accepted",
    "canonical eBay Singapore listing host accepted",
    "canonical eBay Spain listing host accepted",
    "unnumbered verified identity preserves null print run",
    "marketplace-shaped stable original sale id accepted",
    "same-host non-listing URL rejected",
    "malformed marketplace sale id rejected",
    "direct URL and stable sale id must agree",
    "price mismatch rejected",
    "date mismatch rejected",
    "serial mismatch rejected",
    "task identity mismatch rejected",
    "secondary-source URL rejected as original evidence",
    "rejected evidence leaves record unchanged",
    "sale prices are immutable during verification",
    "contribution verifies only after every supporting sale verifies"
  ]
},null,2));
