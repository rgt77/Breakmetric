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
  "src/teamReadiness.js",
  "src/analysisProvenance.js",
  "src/teamComparison.js",
  "src/evCoverage.js",
  "src/evWorkQueue.js",
  "src/evContributionProvenance.js",
  "src/marketCoverage.js",
  "src/marketEvidenceQuality.js",
  "src/marketVerificationTasks.js",
  "src/marketRecordQuality.js",
  "src/marketRecordIssues.js",
  "src/dataFreshness.js",
  "src/urlState.js",
  "src/dataLoader.js",
  "src/errorModel.js",
  "src/storage.js",
  "src/spotCurrency.js",
  "src/runtimeContracts.js"
]) load(file);

const comparisonRows=sandbox.BreakMetricTeamComparison.build({
  metadata:{teams:[{name:"Chelsea"},{name:"Arsenal"}]},
  autographProbabilities:{teams:[
    {team:"Chelsea",chance_at_least_one_autograph_in_case_percent:74.88},
    {team:"Arsenal",chance_at_least_one_autograph_in_case_percent:78.84}
  ]},
  insertProbabilities:{teams:[
    {team:"Chelsea",chance_at_least_one_insert_in_case_percent:99.96},
    {team:"Arsenal",chance_at_least_one_insert_in_case_percent:100}
  ]},
  baseParallelProbabilities:{teams:[
    {team:"Chelsea",chance_at_least_one_base_parallel_in_case_percent:99.98},
    {team:"Arsenal",chance_at_least_one_base_parallel_in_case_percent:99.98}
  ]},
  readiness:{
    Chelsea:{probability:{ready:true,autograph_checklist_count:1},ev:{status:"partial"},market:{status:"secondary-source"},roi:{eligible:false}},
    Arsenal:{probability:{ready:true,autograph_checklist_count:1},ev:{status:"not-valued"},market:{status:"not-audited"},roi:{eligible:false}}
  },
  teamEv:{teams:{Chelsea:{valued_card_count:27}}},
  marketRegistry:{teams:{Chelsea:{audited_contribution_count:27,original_marketplace_verified_contribution_count:0}}}
});
assert(
  sandbox.BreakMetricTeamComparison.validate(comparisonRows,["Chelsea","Arsenal"]).valid,
  "team comparison smoke validation failed"
);
assert(comparisonRows[0].team==="Chelsea" && comparisonRows[1].team==="Arsenal","team comparison order changed");
assert(comparisonRows[0].roi_eligible===false,"team comparison ROI gate failed");

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
  scope:{
    coverage_complete:false,
    denominator_status:"enumerated",
    eligible_contribution_count:638,
    valued_contribution_count:27,
    remaining_contribution_count:611
  },
  market:{
    status:"audited-secondary-source",
    audited_contribution_count:27,
    original_marketplace_verified_contribution_count:0,
    secondary_source_contribution_count:27
  }
});
assert(sandbox.BreakMetricEvCoverage.validate(ev).valid,"EV coverage model invalid");
assert(Math.abs(ev.percentage-4.232)<0.0001,"EV slot coverage percentage mismatch");
assert(ev.eligible_contribution_count===638,"EV eligible denominator smoke failed");
assert(ev.percentage_semantics==="count-based-slot-coverage-not-ev-weighted","EV coverage semantics missing");
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
const autographChecklist=JSON.parse(
  fs.readFileSync(path.join(root,"data/checklists/2026-topps-chrome-premier-league-chrome-autographs.json"),"utf8")
);
const autographProbabilities=JSON.parse(
  fs.readFileSync(path.join(root,"data/derived/2026-topps-chrome-premier-league-hobby-team-autograph-probabilities.json"),"utf8")
);
const insertProbabilities=JSON.parse(
  fs.readFileSync(path.join(root,"data/derived/2026-topps-chrome-premier-league-hobby-team-insert-probabilities.json"),"utf8")
);
const baseParallelProbabilities=JSON.parse(
  fs.readFileSync(path.join(root,"data/derived/2026-topps-chrome-premier-league-hobby-team-base-parallel-probabilities.json"),"utf8")
);
const playerProbabilities=JSON.parse(
  fs.readFileSync(path.join(root,"data/derived/2026-topps-chrome-premier-league-hobby-player-probabilities.json"),"utf8")
);
const marketRegistry=JSON.parse(
  fs.readFileSync(path.join(root,"data/market/2026-topps-chrome-premier-league/market-evidence-registry-v1.json"),"utf8")
);
const playerDerivationManifest=JSON.parse(
  fs.readFileSync(path.join(root,"data/derived/2026-topps-chrome-premier-league-hobby-player-derivation-manifest-v1.json"),"utf8")
);

const readiness=sandbox.BreakMetricTeamReadiness.buildTeamReadiness({
  metadata,
  baseParallelProbabilities,
  insertProbabilities,
  autographProbabilities,
  autographChecklist,
  playerProbabilities,
  teamEv:evData,
  marketRegistry
});
const canonicalTeams=metadata.teams.map(row=>row.name);
const readinessValidation=sandbox.BreakMetricTeamReadiness.validate(
  readiness,
  canonicalTeams
);
assert(readinessValidation.valid,"team readiness smoke failed: "+readinessValidation.errors.join("; "));
assert(readinessValidation.summary.team_count===20,"team readiness team count failed");
assert(readinessValidation.summary.probability_ready_count===20,"team readiness probability count failed");
assert(readinessValidation.summary.ev_partial_count===1,"team readiness partial EV count failed");
assert(readinessValidation.summary.roi_ready_count===0,"team readiness ROI gate failed");

const hobbyFormat=formats.formats.find(row=>row.id==="hobby");
const chelseaPlayer=Object.keys(playerProbabilities.teams?.Chelsea||{})[0]||null;
const provenance=sandbox.BreakMetricProvenance.build({
  metadata,
  playerDerivationManifest,
  marketRegistry,
  teamEv:evData,
  playerProbabilities
},{
  productId:"2026-topps-chrome-premier-league",
  formatId:"hobby",
  format:hobbyFormat,
  team:"Chelsea",
  player:chelseaPlayer
});
const provenanceValidation=sandbox.BreakMetricProvenance.validate(provenance);
assert(provenanceValidation.valid,"analysis provenance smoke failed: "+provenanceValidation.errors.join("; "));
assert(provenance.format.packs===240,"analysis provenance pack count failed");
assert(provenance.ev.coverage_complete===false,"analysis provenance EV coverage gate failed");
assert(sandbox.BreakMetricProvenance.summaryLines(provenance).length===5,"analysis provenance summary failed");

const evScope=JSON.parse(
  fs.readFileSync(path.join(root,"data/derived/2026-topps-chrome-premier-league-hobby-team-ev-scope-v2.json"),"utf8")
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
assert(evScopeContract.metrics.ev_scope_eligible_contribution_count===8896,"EV scope eligible denominator smoke failed");
assert(evScope.teams.Chelsea.eligible_contribution_count===638,"Chelsea EV denominator smoke failed");
assert(Math.abs(evScope.teams.Chelsea.coverage_percent-4.232)<0.0001,"Chelsea EV coverage percent smoke failed");
assert(evScope.teams["AFC Bournemouth"].categories.autographs.status==="not-applicable","zero-denominator category status failed");

const evWorkQueue=JSON.parse(
  fs.readFileSync(path.join(root,"data/derived/2026-topps-chrome-premier-league-hobby-ev-work-queue-v2.json"),"utf8")
);
assert(
  sandbox.BreakMetricEvWorkQueue.validate(evWorkQueue,metadata.teams.map(row=>row.name)).valid,
  "EV work queue helper validation failed"
);
assert(sandbox.BreakMetricEvWorkQueue.nextTask(evWorkQueue,"Chelsea")?.priority===1,"Chelsea EV next task priority failed");
const evQueueSummary=sandbox.BreakMetricEvWorkQueue.summary(evWorkQueue);
assert(evQueueSummary.eligible_contributions===8896,"EV work queue eligible denominator failed");
assert(evQueueSummary.valued_contributions===27,"EV work queue valued count failed");
assert(evQueueSummary.not_applicable===1,"EV work queue not-applicable count failed");

const contributionProvenance=JSON.parse(
  fs.readFileSync(path.join(root,"data/derived/2026-topps-chrome-premier-league-hobby-ev-contribution-provenance-v1.json"),"utf8")
);
const contributionProvenanceValidation=sandbox.BreakMetricEvContributionProvenance.validate(
  contributionProvenance,
  evData
);
assert(contributionProvenanceValidation.valid,"EV contribution provenance helper failed");
const chelseaLineage=sandbox.BreakMetricEvContributionProvenance.teamSummary(contributionProvenance,"Chelsea");
assert(chelseaLineage.contribution_count===27,"Chelsea EV lineage count failed");
assert(chelseaLineage.derivation_linked_count===27,"Chelsea derivation linkage failed");

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

const verificationRecordsBySource=Object.fromEntries(
  (verificationQueue.items||[]).map(item=>[
    item.market_source_file,
    JSON.parse(
      fs.readFileSync(path.join(root,item.market_source_file),"utf8")
    )
  ])
);
const verificationTasks=
  sandbox.BreakMetricMarketVerificationTasks.build(
    verificationQueue,
    verificationRecordsBySource
  );
const verificationTaskValidation=
  sandbox.BreakMetricMarketVerificationTasks.validate(verificationTasks);
assert(
  verificationTaskValidation.valid,
  "market verification task model invalid: "+
    verificationTaskValidation.errors.join("; ")
);
const verificationTaskSummary=
  sandbox.BreakMetricMarketVerificationTasks.summary(verificationTasks);
const verificationSaleCount=Object.values(
  verificationRecordsBySource
).reduce((sum,record)=>sum+(record.sales||[]).length,0);
assert(
  verificationTaskSummary.task_count===verificationSaleCount,
  "verification task count does not match supporting sales"
);
const nextVerificationTask=
  sandbox.BreakMetricMarketVerificationTasks.next(verificationTasks);
assert(
  !nextVerificationTask ||
  nextVerificationTask.verification_status==="pending-original-marketplace",
  "next verification task is not pending"
);

const saleVerificationProgress=
  sandbox.BreakMetricMarketEvidenceQuality.saleVerificationProgress([
    {
      sales:[
        {
          original_marketplace_verified:true,
          evidence_status:"original-marketplace-verified",
          direct_marketplace_url:"https://example.com/sale/1"
        },
        {
          original_marketplace_verified:true,
          evidence_status:"original-marketplace-verified",
          source_sale_id:"sale-2"
        },
        {
          original_marketplace_verified:true,
          evidence_status:"original-marketplace-verified"
        },
        {
          original_marketplace_verified:false,
          evidence_status:"secondary-source-realized-sale",
          source_reference:"https://example.com/discovery"
        }
      ]
    }
  ]);
assert(
  saleVerificationProgress.sale_count===4,
  "sale verification progress sale count failed"
);
assert(
  saleVerificationProgress.original_verified_sale_count===2,
  "sale verification progress accepted invalid original evidence"
);
assert(
  saleVerificationProgress.pending_original_sale_count===2,
  "sale verification pending count failed"
);
assert(
  Math.abs(saleVerificationProgress.verification_share-0.5)<1e-12,
  "sale verification share failed"
);
assert(
  saleVerificationProgress.complete===false,
  "incomplete sale verification marked complete"
);

const currentVerificationRecords=(verificationQueue.items||[]).map(item=>
  JSON.parse(
    fs.readFileSync(path.join(root,item.market_source_file),"utf8")
  )
);
const currentSaleProgress=
  sandbox.BreakMetricMarketEvidenceQuality.saleVerificationProgress(
    currentVerificationRecords
  );
assert(
  currentVerificationRecords.length===verificationQueue.items.length,
  "market verification records do not resolve one-per-contribution"
);
assert(
  currentSaleProgress.sale_count>0,
  "current market verification sample has no realized sales"
);
assert(
  currentSaleProgress.original_verified_sale_count +
    currentSaleProgress.pending_original_sale_count ===
    currentSaleProgress.sale_count,
  "current sale verification progress does not reconcile"
);
const inconsistentVerificationQueue={
  items:[{
    ev_contribution_usd:10,
    original_marketplace_verified:true,
    verification_status:"pending-original-verification"
  }]
};
const inconsistentVerificationImpact=
  sandbox.BreakMetricMarketEvidenceQuality.verificationImpact(
    inconsistentVerificationQueue
  );
assert(
  inconsistentVerificationImpact.original_verified_ev_usd===0,
  "boolean-only market verification was incorrectly counted as verified EV"
);
assert(
  sandbox.BreakMetricMarketEvidenceQuality.validate({
    market:{
      audited_contribution_count:1,
      original_marketplace_verified_contribution_count:0,
      secondary_source_contribution_count:1
    },
    queue:inconsistentVerificationQueue
  }).valid===false,
  "inconsistent market verification queue did not fail closed"
);

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
assert(recordQuality.source_status==="mixed-original-secondary","market record source status failed");
assert(
  marketRecord.evidence_summary?.original_marketplace_verified_sale_count===4 &&
  marketRecord.evidence_summary?.secondary_source_realized_sale_count===26,
  "mixed-source Prism evidence counts failed"
);
assert(
  marketRecord.sales?.[0]?.source_sale_id==="158227124444" &&
  marketRecord.sales?.[0]?.original_marketplace_identity?.print_run===null &&
  marketRecord.sales?.[14]?.source_sale_id==="127838378858" &&
  marketRecord.sales?.[14]?.original_marketplace_identity?.print_run===null &&
  marketRecord.sales?.[14]?.original_marketplace_ended_at===
    "2026-05-05T17:33:00-07:00" &&
  marketRecord.sales?.[14]?.original_marketplace_sale_date_basis===
    "utc-date-from-original-marketplace-timestamp" &&
  marketRecord.sales?.[19]?.source_sale_id==="127802994632" &&
  marketRecord.sales?.[19]?.original_marketplace_verified===true &&
  marketRecord.sales?.[21]?.source_sale_id==="127787552517" &&
  marketRecord.sales?.[21]?.original_marketplace_verified===true,
  "original Prism sale identity smoke failed"
);
assert(["fresh","current","aging","stale"].includes(recordQuality.recency_status),"market record recency band failed");
const recordAudit=sandbox.BreakMetricMarketRecordIssues.audit(
  marketRecord,
  new Date("2026-09-20T00:00:00Z")
);
assert(recordAudit.valid,"market record issue audit failed: "+recordAudit.errors.join("; "));
assert(recordAudit.metrics.sale_count===30,"market record issue sale count failed");

assert(sandbox.BreakMetricStorage.mode()==="session-fallback","storage fallback mode smoke failed");
sandbox.BreakMetricStorage.set("smoke-key","value");
assert(sandbox.BreakMetricStorage.get("smoke-key") === "value","storage fallback read/write failed");
sandbox.BreakMetricStorage.setJson("smoke-json",{ok:true});
assert(sandbox.BreakMetricStorage.getJson("smoke-json")?.ok === true,"storage JSON helper failed");
sandbox.BreakMetricStorage.remove("smoke-key");
assert(sandbox.BreakMetricStorage.get("smoke-key",null) === null,"storage fallback remove failed");

const canonicalUsd=123.456789;
const usdToSek=10.123456;
const usdToEur=0.912345;
const sekDisplay=sandbox.BreakMetricSpotCurrency.displayFromCanonicalUsd(
  canonicalUsd,
  "SEK",
  usdToSek
);
const eurDisplay=sandbox.BreakMetricSpotCurrency.displayFromCanonicalUsd(
  canonicalUsd,
  "EUR",
  usdToEur
);
const backToUsd=sandbox.BreakMetricSpotCurrency.displayFromCanonicalUsd(
  canonicalUsd,
  "USD",
  1
);
assert(Math.abs(backToUsd-canonicalUsd)<1e-12,"canonical FX roundtrip drifted");
assert(
  Math.abs(
    sandbox.BreakMetricSpotCurrency.canonicalUsdFromDisplay(
      Number(sekDisplay.toFixed(2)),
      "SEK",
      usdToSek
    )-canonicalUsd
  )>0,
  "rounded display unexpectedly identical to canonical amount"
);
assert(
  Math.abs(
    sandbox.BreakMetricSpotCurrency.displayFromCanonicalUsd(
      canonicalUsd,
      "EUR",
      usdToEur
    )-eurDisplay
  )<1e-12,
  "canonical FX display conversion is unstable"
);
const editedCanonical=sandbox.BreakMetricSpotCurrency.canonicalUsdFromDisplay(
  1000,
  "SEK",
  usdToSek
);
assert(
  Math.abs(editedCanonical-(1000/usdToSek))<1e-12,
  "manual spot edit did not replace canonical USD basis"
);
const persisted=sandbox.BreakMetricSpotCurrency.persistedState(
  1000,
  "SEK",
  editedCanonical
);
assert(persisted.schema_version===2,"spot state schema v2 missing");
assert(Math.abs(persisted.usd_amount-editedCanonical)<1e-12,"spot state lost canonical USD amount");

assert(typeof sandbox.BreakMetricDataLoader.loadJson==="function","data loader API missing");
assert(typeof sandbox.BreakMetricDataLoader.loadMany==="function","data loader batch API missing");
assert(sandbox.BreakMetricDataLoader.isValidPath("data/products/catalog.json")===true,"safe data path rejected");
assert(sandbox.BreakMetricDataLoader.isValidPath("https://example.com/data.json")===false,"external data URL accepted");
assert(sandbox.BreakMetricDataLoader.isValidPath("../data/file.json")===false,"parent traversal accepted");
assert(sandbox.BreakMetricDataLoader.isValidPath("/data/file.json")===false,"absolute data path accepted");
const loaderStats=sandbox.BreakMetricDataLoader.stats();
assert(Number(loaderStats.requests)===0 && Number(loaderStats.cached)===0,"loader stats initial state invalid");
assert(
  sandbox.BreakMetricErrors.userMessage({name:"DataContractError"}).includes("integrity contract"),
  "error model contract message failed"
);

console.log(JSON.stringify({
  result:"pass",
  checks:[
    "analysis quality",
    "team readiness",
    "analysis provenance",
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
