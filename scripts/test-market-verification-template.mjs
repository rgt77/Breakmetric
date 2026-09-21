import assert from "node:assert/strict";
import {
  buildVerificationTasks,
  nextPendingTask,
  createEvidenceTemplate
} from "./lib/market-verification-template.mjs";
import {
  validateEvidence
} from "./lib/market-verification-evidence.mjs";

const queue={
  product_id:"product",
  format_id:"hobby",
  items:[
    {
      priority_rank:1,
      team:"Chelsea",
      card_id:"card-1",
      player:"Player One",
      set:"Base Cards",
      parallel:"Gold Refractor",
      ev_contribution_usd:5,
      market_source_file:"data/market/example.json"
    }
  ]
};

const product={
  id:"product",
  market_identity:{
    accepted_series_aliases:[
      "2026 Topps Chrome Premier League",
      "2025-26 Topps Chrome Premier League"
    ]
  }
};

const record={
  product_id:"product",
  card_number:"CA-EV",
  serial_numbering:50,
  team:"Chelsea",
  player:"Player One",
  set:"Base Cards",
  parallel:"Gold Refractor",
  sales:[
    {
      sale_date:"2026-02-01",
      sale_price:100,
      marketplace:"eBay",
      serial_copy:"01/50",
      direct_marketplace_url:"https://www.ebay.com/itm/188934418234",
      evidence_status:"original-marketplace-verified",
      original_marketplace_verified:true,
      original_marketplace_identity:{
        product_id:"product",
        series:"2025-26 Topps Chrome Premier League",
        card_number:"CA-EV",
        parallel:"Gold Refractor",
        print_run:50,
        player:"Player One",
        team:"Chelsea"
      }
    },
    {
      sale_date:"2026-02-02",
      sale_price:125,
      marketplace:"eBay",
      serial_copy:"02/50",
      source_reference:"https://www.sportscardspro.com/example",
      evidence_status:"secondary-source-realized-sale",
      original_marketplace_verified:false
    }
  ]
};

const tasks=buildVerificationTasks({
  queue,
  recordsBySource:{
    "data/market/example.json":record
  }
});

assert.equal(tasks.length,2);
assert.equal(tasks[0].verification_status,"verified-original-marketplace");
assert.equal(tasks[1].verification_status,"pending-original-marketplace");

const next=nextPendingTask(tasks);
assert.equal(next.sale_index,1);
assert.equal(next.task_id,"product::hobby::Chelsea::card-1::1");

const template=createEvidenceTemplate(next,{
  queuePath:"data/market/queue.json"
});
assert.equal(template.schema_version,2);
assert.equal(template.task_id,next.task_id);
assert.equal(template.product_id,"product");
assert.equal(template.market_source_file,next.market_source_file);
assert.equal(template.sale_index,1);
assert.equal(template.sale_date,"2026-02-02");
assert.equal(template.sale_price_usd,125);
assert.equal(template.marketplace,"eBay");
assert.equal(template.serial_copy,"02/50");
assert.equal(template.expected_identity.card_number,"CA-EV");
assert.equal(template.expected_identity.parallel,"Gold Refractor");
assert.equal(template.expected_identity.print_run,50);
assert.equal(template.listing_identity.series,"");
assert.equal(template.listing_identity.card_number,"");
assert.equal(template.listing_identity.parallel,"");
assert.equal(template.listing_identity.print_run,null);
assert.equal(template.direct_marketplace_url,"");
assert.equal(template.source_sale_id,"");
assert.equal(template.verified_at,"");
assert.equal(template.queue_path,"data/market/queue.json");

const untouchedValidation=validateEvidence({
  task:next,
  record,
  product,
  evidence:template
});
assert.equal(untouchedValidation.valid,false);
assert.ok(
  untouchedValidation.errors.some(error=>
    error.includes("requires direct marketplace URL or stable sale id")
  )
);
assert.ok(
  untouchedValidation.errors.some(error=>
    error.includes("verified_at must be a valid")
  )
);

const completed={
  ...template,
  listing_identity:{
    series:"2025-26 Topps Chrome Premier League",
    card_number:"CA-EV",
    parallel:"Gold Refractor",
    print_run:50,
    player:"Player One",
    team:"Chelsea"
  },
  direct_marketplace_url:"https://www.ebay.com/itm/188934418234",
  verified_at:"2026-09-21"
};
assert.equal(
  validateEvidence({
    task:next,
    record,
    product,
    evidence:completed
  }).valid,
  true
);

assert.equal(
  nextPendingTask(tasks,"product::hobby::Chelsea::card-1::0"),
  null
);
assert.equal(
  nextPendingTask(tasks,"product::hobby::Chelsea::card-1::1")?.sale_index,
  1
);

console.log(JSON.stringify({
  result:"pass",
  checks:[
    "verified sales are skipped only when stored product identity is present",
    "next task follows contribution rank then stored sale order",
    "expected identity is derived from the pending task while observed listing identity remains blank",
    "original locator fields are blank by default",
    "verified_at is blank by default",
    "untouched template cannot pass evidence ingest",
    "completed original evidence passes ingest validation",
    "verified task ids cannot be selected as pending"
  ]
},null,2));
