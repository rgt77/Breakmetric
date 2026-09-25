import {strict as assert} from "node:assert";import {contribution,roi,probabilityAtLeastOne,aggregate,analyzeSpot} from "./lib/ev-engine.mjs";
assert.equal(contribution(0.5,100),50);assert.equal(contribution(-1,100),null);assert.equal(roi(120,100),20);assert.equal(roi(100,0),null);assert.equal(probabilityAtLeastOne(0),0);
const a=aggregate([{expected_copies_per_case:0.5,market_value_usd:100},{expected_copies_per_case:1,market_value_usd:25}]);assert.equal(a.ev_usd,75);assert.equal(a.valued_contribution_count,2);assert.equal(a.coverage_pct,100);
const s=analyzeSpot([{expected_copies_per_case:1,market_value_usd:120}],100);assert.equal(s.ev_usd,120);assert.equal(s.net_value_usd,20);assert.equal(s.roi_pct,20);assert.equal(s.value_multiple,1.2);assert.equal(s.analysis_ready,true);
process.stdout.write(JSON.stringify({status:"passed",checks:13})+"\n");
