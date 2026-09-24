import assert from "node:assert/strict";
import {
  evidenceBreakdown,
  estimateModeledValue,
  median
} from "./lib/valuation-model.mjs";

assert.equal(median([1,3,2]),2);
assert.equal(median([1,3]),2);
assert.equal(median([]),null);

const task={
  team:"Chelsea",
  category:"base_parallels",
  subjects:["Player A"]
};
const canonical=value=>({
  evidence_class:"canonical-realized-sale",
  team:"Chelsea",
  category:"base_parallels",
  subject:"Player A",
  value
});
const provider=value=>({
  evidence_class:"exact-provider-current-price",
  team:"Chelsea",
  category:"base_parallels",
  subject:"Player A",
  value
});

const c=estimateModeledValue(task,[canonical(2),provider(4)]);
assert.equal(c.tier,"C");
assert.equal(c.value,3);
assert.deepEqual(evidenceBreakdown(c.supporting_evidence),{
  total_count:2,
  canonical_realized_sale_count:1,
  exact_provider_current_price_count:1
});

const dEvidence=[
  {evidence_class:"canonical-realized-sale",team:"Chelsea",category:"inserts",subject:"X",value:3},
  {evidence_class:"canonical-realized-sale",team:"Chelsea",category:"inserts",subject:"Y",value:5},
  {evidence_class:"canonical-realized-sale",team:"Chelsea",category:"inserts",subject:"Z",value:7}
];
const d=estimateModeledValue({
  team:"Chelsea",
  category:"inserts",
  subjects:["No evidence"]
},dEvidence);
assert.equal(d.tier,"D");
assert.equal(d.basis,"team-category-model");
assert.equal(d.value,5);

const productD=estimateModeledValue({
  team:"Arsenal",
  category:"inserts",
  subjects:["No evidence"]
},dEvidence);
assert.equal(productD.tier,"D");
assert.equal(productD.basis,"product-category-model");

const e=estimateModeledValue({
  team:"Arsenal",
  category:"autographs",
  subjects:["No evidence"]
},dEvidence);
assert.equal(e.tier,"E");
assert.equal(e.value,null);

console.log(JSON.stringify({result:"pass",checks:14},null,2));
