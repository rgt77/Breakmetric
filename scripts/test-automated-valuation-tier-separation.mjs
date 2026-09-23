import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {spawnSync} from "node:child_process";

const root=process.cwd();
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"breakmetric-valuation-"));
const output=path.join(temp,"candidates.json");

try{
  const run=spawnSync(process.execPath,[
    "scripts/generate-automated-valuation-candidates.mjs",
    "--output",output
  ],{cwd:root,encoding:"utf8"});

  if(run.status!==0){
    throw new Error("candidate generator failed\n"+run.stdout+"\n"+run.stderr);
  }

  const data=JSON.parse(fs.readFileSync(output,"utf8"));
  const rows=Array.isArray(data.candidates)?data.candidates:[];

  let directEv=0;
  let modeledEv=0;
  for(const row of rows){
    const breakdown=row.evidence_breakdown||{};
    assert.equal(
      Number(breakdown.total_count||0),
      Number(breakdown.canonical_realized_sale_count||0)+
      Number(breakdown.exact_provider_current_price_count||0),
      "evidence breakdown must reconcile for "+row.task_id
    );
    assert.equal(
      Number(row.evidence_observation_count||0),
      Number(breakdown.total_count||0),
      "observation count must match evidence breakdown for "+row.task_id
    );
    assert.equal(row.canonical_ev_eligible,false);

    if(row.valuation_tier==="B"){
      assert.equal(row.valuation_class,"direct-provider");
      assert.equal(row.direct_market_observation,true);
      assert.equal(row.modeled_value,false);
      assert.equal(breakdown.exact_provider_current_price_count,1);
      assert.equal(breakdown.canonical_realized_sale_count,0);
      directEv+=Number(row.candidate_ev_contribution_usd||0);
    }else if(row.valuation_tier==="C"||row.valuation_tier==="D"){
      assert.equal(row.valuation_class,"modeled");
      assert.equal(row.direct_market_observation,false);
      assert.equal(row.modeled_value,true);
      assert.ok(breakdown.total_count>=1);
      modeledEv+=Number(row.candidate_ev_contribution_usd||0);
    }else if(row.valuation_tier==="E"){
      assert.equal(row.valuation_class,"unknown");
      assert.equal(row.direct_market_observation,false);
      assert.equal(row.modeled_value,false);
      assert.equal(row.market_value_estimate_usd,null);
      assert.equal(row.candidate_ev_contribution_usd,null);
    }
  }

  const round=value=>Math.round(Number(value)*1e8)/1e8;
  assert.equal(
    data.summary.direct_provider_candidate_ev_total_usd,
    round(directEv)
  );
  assert.equal(
    data.summary.modeled_candidate_ev_total_usd,
    round(modeledEv)
  );
  assert.equal(
    data.summary.noncanonical_candidate_ev_total_usd,
    round(directEv+modeledEv)
  );
  assert.match(
    String(data.summary.aggregate_semantics||""),
    /non-canonical/i
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(data.summary,"candidate_ev_total_usd"),
    false,
    "ambiguous legacy aggregate must not return"
  );

  console.log(JSON.stringify({
    result:"pass",
    candidate_count:rows.length,
    tier_count:data.summary.tier_count,
    direct_provider_candidate_ev_total_usd:
      data.summary.direct_provider_candidate_ev_total_usd,
    modeled_candidate_ev_total_usd:
      data.summary.modeled_candidate_ev_total_usd
  },null,2));
}finally{
  fs.rmSync(temp,{recursive:true,force:true});
}
