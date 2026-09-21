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

const record={
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
      original_marketplace_verified:true
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
assert.equal(template.task_id,next.task_id);
assert.equal(template.market_source_file,next.market_source_file);
assert.equal(template.sale_index,1);
assert.equal(template.sale_date,"2026-02-02");
assert.equal(template.sale_price_usd,125);
assert.equal(template.marketplace,"eBay");
assert.equal(template.serial_copy,"02/50");
assert.equal(template.direct_marketplace_url,"");
assert.equal(template.source_sale_id,"");
assert.equal(template.verified_at,"");
assert.equal(template.queue_path,"data/market/queue.json");

const untouchedValidation=validateEvidence({
  task:next,
  record,
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
  direct_marketplace_url:"https://www.ebay.com/itm/236989109655",
  verified_at:"2026-09-21"
};
assert.equal(
  validateEvidence({
    task:next,
    record,
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
    "verified sales are skipped",
    "next task follows contribution rank then stored sale order",
    "template identity is derived from the pending task",
    "original locator fields are blank by default",
    "verified_at is blank by default",
    "untouched template cannot pass evidence ingest",
    "completed original evidence passes ingest validation",
    "verified task ids cannot be selected as pending"
  ]
},null,2));
