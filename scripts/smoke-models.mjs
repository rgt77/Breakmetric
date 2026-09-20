import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root=process.cwd();
const sandbox={
  console,
  URLSearchParams,
  Date,
  Map,
  Set,
  Number,
  String,
  Boolean,
  Object,
  Array,
  Math,
  JSON,
  setTimeout,
  clearTimeout
};
sandbox.globalThis=sandbox;
vm.createContext(sandbox);

const load=file=>{
  const source=fs.readFileSync(path.join(root,file),"utf8");
  vm.runInContext(source,sandbox,{filename:file});
};

const assert=(condition,message)=>{
  if(!condition) throw new Error(message);
};

for(const file of [
  "src/analysisQuality.js",
  "src/evCoverage.js",
  "src/evWorkQueue.js",
  "src/marketCoverage.js",
  "src/marketEvidenceQuality.js",
  "src/marketRecordQuality.js",
  "src/marketRecordIssues.js",
  "src/dataFreshness.js",
  "src/urlState.js",
  "src/dataLoader.js",
  "src/errorModel.js",
  "src/runtimeContracts.js"
]) load(file);

const quality=sandbox.BreakMetricAnalysisQuality.build({
  readiness:{probability:{ready:true}},
  teamEv:{coverage_complete:false,valued_card_count:27},
  market:{
    audited_contribution_count:27,
    original_marketplace_verified_contribution_count:0,
    secondary_source_contribution_count:27,
    roi_eligible:false
  },
  spotPrice:100
});
assert(sandbox.BreakMetricAnalysisQuality.validate(quality).valid,"analysis quality model invalid");
assert(quality.probability.state==="ready","probability readiness smoke failed");
assert(quality.ev.state==="partial","EV readiness smoke failed");
assert(quality.market.level==="provisional","market confidence smoke failed");
assert(quality.roi.eligible===false,"ROI should remain gated");

const ev=sandbox.BreakMetricEvCoverage.build({
  teamEv:{coverage_complete:false,valued_card_count:27},
  market:{
    status:"audited-secondary-source",
    audited_contribution_count:27,
    original_marketplace_verified_contribution_count:0,
    secondary_source_contribution_count:27
  }
});
assert(sandbox.BreakMetricEvCoverage.validate(ev).valid,"EV coverage model invalid");
assert(ev.percentage===null,"EV coverage invented a percentage");
assert(ev.blockers.length>0,"EV coverage blockers missing");

const market=sandbox.BreakMetricMarketCoverage.build({
  market_evidence_status:"secondary-source-only",
  audited_contribution_count:27,
  original_marketplace_verified_contribution_count:0,
  secondary_source_contribution_count:27,
  roi_eligible:false
});
assert(sandbox.BreakMetricMarketCoverage.validate(market).valid,"market coverage model invalid");
assert(market.original_share===0,"market verification share smoke failed");

const fresh=sandbox.BreakMetricFreshness.build({
  productIntegrity:{validated_at:"2026-09-20"},
  formatIntegrity:{validated_at:"2026-09-20"},
  marketRegistry:{generated_at:"2026-09-20"}
});
assert(sandbox.BreakMetricFreshness.validate(fresh).valid,"freshness model invalid");
assert(
  sandbox.BreakMetricFreshness.daysOld("2026-09-20",new Date("2026-09-20T12:00:00Z"))===0,
  "freshness age smoke failed"
);

const parsed=sandbox.BreakMetricUrlState.read(
  "?product=2026-topps-chrome-premier-league&format=hobby&team=Chelsea&player=Est%C3%AAv%C3%A3o+Willian"
);
assert(parsed.team==="Chelsea","URL team parse failed");
assert(parsed.player==="Estêvão Willian","URL player parse failed");
const built=sandbox.BreakMetricUrlState.build(parsed,"/index.html");
assert(built.includes("team=Chelsea"),"URL build failed");
assert(built.includes("player=Est%"),"URL Unicode roundtrip failed");

const formats=JSON.parse(
  fs.readFileSync(path.join(root,"data/formats/2026-topps-chrome-premier-league.json"),"utf8")
);
const contract=sandbox.BreakMetricContracts.validateFormatCatalog(
  formats,
  "2026-topps-chrome-premier-league"
);
assert(contract.valid,"format contract failed: "+contract.errors.join("; "));

const metadata=JSON.parse(
  fs.readFileSync(path.join(root,"data/products/2026-topps-chrome-premier-league.json"),"utf8")
);
const evData=JSON.parse(
  fs.readFileSync(path.join(root,"data/derived/2026-topps-chrome-premier-league-team-ev-progress.json"),"utf8")
);
const evScope=JSON.parse(
  fs.readFileSync(path.join(root,"data/derived/2026-topps-chrome-premier-league-hobby-team-ev-scope-v1.json"),"utf8")
);
const evScopeContract=sandbox.BreakMetricContracts.validateEvScope(
  evScope,
  "2026-topps-chrome-premier-league",
  "hobby",
  metadata.teams.map(row=>row.name),
  evData
);
assert(evScopeContract.valid,"EV scope contract failed: "+evScopeContract.errors.join("; "));
assert(evScopeContract.metrics.ev_scope_partial_team_count===1,"EV scope partial-team smoke failed");
assert(evScopeContract.metrics.ev_scope_complete_team_count===0,"EV scope complete-team smoke failed");

const evWorkQueue=JSON.parse(
  fs.readFileSync(path.join(root,"data/derived/2026-topps-chrome-premier-league-hobby-ev-work-queue-v1.json"),"utf8")
);
assert(
  sandbox.BreakMetricEvWorkQueue.validate(evWorkQueue,metadata.teams.map(row=>row.name)).valid,
  "EV work queue helper validation failed"
);
assert(sandbox.BreakMetricEvWorkQueue.nextTask(evWorkQueue,"Chelsea")?.priority===1,"Chelsea EV next task priority failed");

const verificationQueue=JSON.parse(
  fs.readFileSync(path.join(root,"data/market/2026-topps-chrome-premier-league/market-verification-queue-v1.json"),"utf8")
);
const qualityValidation=sandbox.BreakMetricMarketEvidenceQuality.validate({
  market:{
    audited_contribution_count:27,
    original_marketplace_verified_contribution_count:0,
    secondary_source_contribution_count:27
  },
  queue:verificationQueue
});
assert(qualityValidation.valid,"market evidence quality validation failed");
const verificationImpact=sandbox.BreakMetricMarketEvidenceQuality.verificationImpact(verificationQueue);
assert(Math.abs(verificationImpact.total_ev_usd-42.72)<0.02,"market verification EV impact sum failed");
assert(verificationImpact.original_verified_ev_usd===0,"unexpected original verified EV impact");

const marketRecord=JSON.parse(
  fs.readFileSync(path.join(root,"data/market/2026-topps-chrome-premier-league/68-estevao-willian-prism-refractor.json"),"utf8")
);
const recordQuality=sandbox.BreakMetricMarketRecordQuality.evaluate(
  marketRecord,
  new Date("2026-09-20T00:00:00Z")
);
assert(sandbox.BreakMetricMarketRecordQuality.validate(recordQuality).valid,"market record quality invalid");
assert(recordQuality.sale_count===30,"market record sample-size smoke failed");
assert(recordQuality.sample_size_confidence==="high","market record sample band failed");
assert(recordQuality.source_status==="secondary-source-only","market record source status failed");
assert(["fresh","current","aging","stale"].includes(recordQuality.recency_status),"market record recency band failed");
const recordAudit=sandbox.BreakMetricMarketRecordIssues.audit(
  marketRecord,
  new Date("2026-09-20T00:00:00Z")
);
assert(recordAudit.valid,"market record issue audit failed: "+recordAudit.errors.join("; "));
assert(recordAudit.metrics.sale_count===30,"market record issue sale count failed");

assert(typeof sandbox.BreakMetricDataLoader.loadJson==="function","data loader API missing");
assert(
  sandbox.BreakMetricErrors.userMessage({name:"DataContractError"}).includes("integrity contract"),
  "error model contract message failed"
);

console.log(JSON.stringify({
  result:"pass",
  checks:[
    "analysis quality",
    "EV coverage",
    "EV work queue",
    "market evidence coverage",
    "market evidence source quality",
    "dataset freshness",
    "shareable URL state",
    "break-allocation runtime contract",
    "data-loader API",
    "error-message model"
  ]
},null,2));
