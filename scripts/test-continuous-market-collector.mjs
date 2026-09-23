import assert from "node:assert/strict";
import {
  apiPriceUsd,
  buildSearchQuery,
  exactProviderIdentity,
  mergeObservation,
  parseCsv
} from "./lib/market-automation.mjs";

const task={
  task_id:"release::hobby::Chelsea::base_parallels::Base Cards::62::Refractor",
  team:"Chelsea",
  category:"base_parallels",
  set:"Base Cards",
  card_number:"62",
  subjects:["Liam Delap"],
  parallel:"Refractor",
  economic_priority_proxy_usd:17.9964
};

const exact={
  id:"11842805",
  "console-name":"Soccer Cards 2026 Topps Chrome Premier League",
  "product-name":"Liam Delap [Refractor] #62",
  "loose-price":299,
  "sales-volume":"1"
};
assert.equal(exactProviderIdentity(task,exact).exact,true);
assert.equal(apiPriceUsd(exact),2.99);
assert.match(buildSearchQuery(task),/Liam Delap/);

const sapphire={
  ...exact,
  "console-name":"Soccer Cards 2026 Topps Chrome Sapphire Premier League"
};
assert.equal(exactProviderIdentity(task,sapphire).exact,false);

const prism={...exact,"product-name":"Liam Delap [Prism Refractor] #62"};
assert.equal(exactProviderIdentity(task,prism).exact,false);

const wrongCard={...exact,"product-name":"Liam Delap [Refractor] #63"};
assert.equal(exactProviderIdentity(task,wrongCard).exact,false);

const store={entries:{}};
const first=mergeObservation(store,task,{
  source:"sportscardspro-api",
  status:"exact-current-price",
  provider_product_id:"11842805",
  exact_identity:true,
  raw_price_usd:2.99,
  sales_volume_yearly:1,
  query:"q",
  provider_product_name:exact["product-name"],
  provider_set_name:exact["console-name"],
  identity_reasons:[]
},"2026-09-21T19:00:00.000Z");
assert.equal(first.changed,true);
const second=mergeObservation(store,task,{
  source:"sportscardspro-api",
  status:"exact-current-price",
  provider_product_id:"11842805",
  exact_identity:true,
  raw_price_usd:2.99,
  sales_volume_yearly:1,
  query:"q",
  provider_product_name:exact["product-name"],
  provider_set_name:exact["console-name"],
  identity_reasons:[]
},"2026-09-21T19:15:00.000Z");
assert.equal(second.changed,false);

const csv=parseCsv('id,console-name,product-name,loose-price\n11842805,"Soccer Cards 2026 Topps Chrome Premier League","Liam Delap [Refractor] #62","2.99"\n');
assert.equal(csv.length,1);
assert.equal(csv[0].id,"11842805");

console.log(JSON.stringify({result:"pass",checks:10},null,2));
