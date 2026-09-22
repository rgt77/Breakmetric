import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root=process.cwd();
const readJson=file=>JSON.parse(fs.readFileSync(path.join(root,file),"utf8"));

const sandbox={
  console,
  Object,
  Array,
  String,
  Number,
  Boolean,
  Set,
  Map,
  Math,
  JSON
};
sandbox.globalThis=sandbox;
vm.createContext(sandbox);
vm.runInContext(
  fs.readFileSync(path.join(root,"src/runtimeContracts.js"),"utf8"),
  sandbox,
  {filename:"src/runtimeContracts.js"}
);

const contracts=sandbox.BreakMetricContracts;
if(!contracts) throw new Error("BreakMetricContracts unavailable");

const catalog=readJson("data/products/catalog.json");
const productId="2026-topps-chrome-premier-league";
const catalogEntry=(catalog.products||[]).find(x=>x.id===productId);
if(!catalogEntry) throw new Error("Catalog product missing: "+productId);

const metadata=readJson(catalogEntry.product_data);
const formatCatalog=readJson(catalogEntry.format_data);
const format=(formatCatalog.formats||[]).find(x=>x.id==="hobby");
if(!format) throw new Error("Hobby format missing");
const analysis=format.analysis_data||{};

const loadRoute=key=>{
  const file=analysis[key];
  if(typeof file!=="string"||!file) throw new Error("Analysis route missing: "+key);
  return readJson(file);
};

const bundle={
  metadata,
  playerIndex:loadRoute("player_index_data"),
  playerProbabilities:loadRoute("player_probability_data"),
  playerDerivationManifest:loadRoute("player_derivation_manifest_data"),
  baseChecklist:loadRoute("base_checklist_data"),
  autographProbabilities:loadRoute("team_autograph_probability_data"),
  autographChecklist:loadRoute("autograph_checklist_data"),
  insertProbabilities:loadRoute("team_insert_probability_data"),
  baseParallelProbabilities:loadRoute("team_base_parallel_probability_data"),
  liveSupply:loadRoute("live_supply_data"),
  sealedSupply:loadRoute("sealed_supply_data"),
  production:loadRoute("production_estimate_data"),
  marketRegistry:loadRoute("market_evidence_registry_data"),
  teamEv:loadRoute("ev_data"),
  evScope:loadRoute("ev_scope_data"),
  evWorkQueue:loadRoute("ev_work_queue_data"),
  evContributionProvenance:loadRoute("ev_contribution_provenance_data"),
  marketVerificationQueue:loadRoute("market_verification_queue_data"),
  marketVerificationScope:loadRoute("market_verification_scope_data")
};

const report=contracts.validateAnalysisBundle(bundle,{
  productId,
  formatId:"hobby",
  catalogEntry,
  analysisData:analysis,
  analysisUnit:format.analysis_unit
});

console.log(JSON.stringify({
  result:report.valid?"pass":"fail",
  valid:report.valid,
  errors:report.errors||[],
  warnings:report.warnings||[],
  metrics:report.metrics||{}
},null,2));

if(!report.valid) process.exit(1);
