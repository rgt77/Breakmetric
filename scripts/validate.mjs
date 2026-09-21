import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = process.cwd();
const failures = [];
const checks = [];
const pass = (name, condition, detail = "") => {
  checks.push({ name, pass: Boolean(condition), detail });
  if (!condition) failures.push(detail ? name + ": " + detail : name);
};
const read = p => fs.readFileSync(path.join(root, p), "utf8");
const json = p => JSON.parse(read(p));
const exists = p => typeof p === "string" && fs.existsSync(path.join(root, p));
const strictDate = value => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return !Number.isNaN(new Date(value + "T00:00:00Z").getTime());
};

function walk(dir) {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(entry => {
    const rel = path.posix.join(dir, entry.name);
    return entry.isDirectory() ? walk(rel) : [rel];
  });
}

for (const file of walk("data").filter(file => file.endsWith(".json"))) {
  try {
    json(file);
  } catch (error) {
    failures.push(`JSON parse failed: ${file}: ${error.message}`);
  }
}
pass("all data JSON parses", !failures.some(x => x.startsWith("JSON parse failed")));

const methodology = json("data/methodology/v1.2.json");
pass("v1.2 methodology schema", methodology.schema_version === 1);
pass("v1.2 methodology principles present", Array.isArray(methodology.principles) && methodology.principles.length >= 7);
const evPolicy = json("data/methodology/ev-coverage-v1.json");
pass("EV coverage policy forbids unsupported percentage", evPolicy.current_state?.percentage_allowed === false);
const marketSourcePolicy = json("data/methodology/market-source-policy-v1.json");
const marketRecordQualityPolicy = json("data/methodology/market-record-quality-v1.json");
const teamComparisonPolicy = json("data/methodology/team-comparison-v1.json");
const playerDisclosurePolicy = json("data/methodology/player-disclosure-v1.json");
const dataLoaderPolicy = json("data/methodology/data-loader-v2.json");
const storagePolicy = json("data/methodology/storage-v1.json");
const safeDomPolicy = json("data/methodology/safe-dom-rendering-v1.json");
pass("safe DOM rendering policy schema", safeDomPolicy.schema_version === 1);
pass(
  "safe DOM policy prohibits dynamic innerHTML",
  safeDomPolicy.prohibited_patterns?.some(value => value.includes("innerHTML"))
);
pass("storage policy schema", storagePolicy.schema_version === 1);
pass("storage policy defines session fallback", storagePolicy.persistence_order?.length === 2);
pass("data loader v2 policy schema", dataLoaderPolicy.schema_version === 2);
pass("analysis loader concurrency capped at six", Number(dataLoaderPolicy.request_policy?.application_concurrency) === 6);
pass("data loader max payload is bounded", Number(dataLoaderPolicy.request_policy?.default_max_bytes) === 5000000);
pass("player disclosure policy schema", playerDisclosurePolicy.schema_version === 1);
pass("player disclosure has four collapsed detail groups", playerDisclosurePolicy.collapsed_by_default?.length === 4);
pass("team comparison policy schema", teamComparisonPolicy.schema_version === 1);
pass("team comparison remains descriptive", teamComparisonPolicy.default_order === "canonical-checklist-order");
pass("market record quality policy schema", marketRecordQualityPolicy.schema_version === 1);
pass("market record spread review threshold", Number(marketRecordQualityPolicy.spread_alert?.ratio_threshold) === 4);
pass("market source policy schema", marketSourcePolicy.schema_version === 1);
pass("market source policy has three tiers", Array.isArray(marketSourcePolicy.source_tiers) && marketSourcePolicy.source_tiers.length === 3);
pass("secondary market evidence remains provisional", marketSourcePolicy.source_tiers?.find(x => x.id === "secondary-source-realized-sale")?.roi_capability === "provisional-only");

const n100 = json("data/validation/v12-n100.json");
pass("n100 step count is exactly 100", n100.step_count === 100 && n100.steps?.length === 100);
pass("n100 starts at step 397", n100.steps?.[0]?.step === 397);
pass("n100 ends at step 496", n100.steps?.[99]?.step === 496);
pass("n100 steps are sequential", n100.steps?.every((row,index)=>row.step === 397 + index));
pass("n100 implementation flags complete", n100.steps?.every(row=>row.implemented === true));

const n200 = json("data/validation/v13-n200.json");
pass("n200 step count is exactly 200", n200.step_count === 200 && n200.steps?.length === 200);
pass("n200 starts at step 498", n200.steps?.[0]?.step === 498);
pass("n200 ends at step 697", n200.steps?.[199]?.step === 697);
pass("n200 steps are sequential", n200.steps?.every((row,index)=>row.step === 498 + index));
pass("n200 implementation flags complete", n200.steps?.every(row=>row.implemented === true));
pass("n200 release marker is v1.3.0", n200.release === "BreakMetric v1.3.0");

const catalog = json("data/products/catalog.json");
pass("product catalog has products", Array.isArray(catalog.products) && catalog.products.length > 0);

for (const product of catalog.products || []) {
  pass(`product id present: ${product.id || "unknown"}`, Boolean(product.id));

  if (product.status !== "ready") continue;

  pass(`ready product data route exists: ${product.id}`, exists(product.product_data), product.product_data);
  pass(`ready product integrity route exists: ${product.id}`, exists(product.integrity_data), product.integrity_data);
  pass(`ready product format route exists: ${product.id}`, exists(product.format_data), product.format_data);

  if (!exists(product.product_data) || !exists(product.format_data)) continue;

  const metadata = json(product.product_data);
  const productIntegrity = json(product.integrity_data);
  const formats = json(product.format_data);

  pass(`metadata id matches catalog: ${product.id}`, metadata.id === product.id);
  pass(`product integrity date valid: ${product.id}`, strictDate(productIntegrity.validated_at));
  pass(`format product id matches catalog: ${product.id}`, formats.product_id === product.id);

  for (const format of formats.formats || []) {
    if (format.status !== "ready") continue;

    pass(`ready format integrity exists: ${product.id}/${format.id}`, exists(format.integrity_data), format.integrity_data);
    pass(`ready format has analysis data: ${product.id}/${format.id}`, Boolean(format.analysis_data));

    for (const [key, route] of Object.entries(format.analysis_data || {})) {
      pass(`analysis route exists: ${product.id}/${format.id}/${key}`, exists(route), route);
    }

    const allocation = format.break_allocation_policy || {};
    pass(
      `break allocation protected: ${product.id}/${format.id}`,
      allocation.status === "protected" &&
      allocation.single_team_rule === "listed-team" &&
      allocation.multi_team_rule === "exclude-until-explicit-break-rule" &&
      allocation.ev_treatment === "exclude-unallocated-multi-team-cards"
    );

    const unit = format.analysis_unit || {};
    const cfg = format.configuration || {};
    pass(`analysis unit is one case: ${product.id}/${format.id}`, unit.type === "case" && Number(unit.cases) === 1);
    pass(`box math: ${product.id}/${format.id}`, Number(unit.boxes) === Number(cfg.boxes_per_case));
    pass(`pack math: ${product.id}/${format.id}`, Number(unit.packs) === Number(cfg.boxes_per_case) * Number(cfg.packs_per_box));
    pass(`card math: ${product.id}/${format.id}`, Number(unit.cards) === Number(unit.packs) * Number(cfg.cards_per_pack));

    const formatIntegrity = json(format.integrity_data);
    pass(`format integrity date valid: ${product.id}/${format.id}`, strictDate(formatIntegrity.validated_at));

    const registry = json(format.analysis_data.market_evidence_registry_data);
    pass(`market registry date valid: ${product.id}/${format.id}`, strictDate(registry.generated_at));

    const evData = json(format.analysis_data.ev_data);
    const evScope = json(format.analysis_data.ev_scope_data);
    const evWorkQueue = json(format.analysis_data.ev_work_queue_data);
    const evContributionProvenance = json(format.analysis_data.ev_contribution_provenance_data);
    const marketVerificationQueue = json(format.analysis_data.market_verification_queue_data);
    pass(
      `EV contribution provenance linked: ${product.id}/${format.id}`,
      evContributionProvenance.model === "ev-contribution-provenance-v1" &&
      evContributionProvenance.summary?.missing_derivation_count === 0 &&
      evContributionProvenance.entries?.length ===
        Object.values(evData.teams || {}).reduce((sum,row)=>sum+(row.contributions || []).length,0)
    );
    pass(
      `EV work queue task count: ${product.id}/${format.id}`,
      evWorkQueue.model === "ev-work-queue-v1" &&
      evWorkQueue.tasks?.length === (metadata.teams || []).length * 3
    );
    pass(
      `market verification queue reconciles to EV contributions: ${product.id}/${format.id}`,
      marketVerificationQueue.model === "market-verification-queue-v1" &&
      marketVerificationQueue.items?.length ===
        Object.values(evData.teams || {}).reduce((sum,row)=>sum+(row.contributions || []).length,0)
    );
    pass(
      `market verification queue ranks sequentially: ${product.id}/${format.id}`,
      marketVerificationQueue.items?.every((row,index)=>Number(row.priority_rank)===index+1)
    );
    pass(
      `EV scope validates: ${product.id}/${format.id}`,
      evScope.product_id === product.id &&
      evScope.format_id === format.id &&
      evScope.model === "team-ev-scope-v1"
    );
    pass(
      `EV scope canonical team count: ${product.id}/${format.id}`,
      Object.keys(evScope.teams || {}).length === (metadata.teams || []).length
    );
    for (const team of (metadata.teams || []).map(row => row.name)) {
      const scopeRow = evScope.teams?.[team];
      const evRow = evData.teams?.[team] || null;
      const categories = ["base_parallels","inserts","autographs"];
      const valuedScope = categories.reduce(
        (sum,key) => sum + Number(scopeRow?.categories?.[key]?.valued_contribution_count || 0),
        0
      );
      pass(
        `EV scope categories present: ${product.id}/${format.id}/${team}`,
        categories.every(key => scopeRow?.categories?.[key])
      );
      pass(
        `EV scope contribution count matches EV: ${product.id}/${format.id}/${team}`,
        valuedScope === Number(evRow?.valued_card_count || 0)
      );
      pass(
        `EV scope completion matches EV: ${product.id}/${format.id}/${team}`,
        Boolean(scopeRow?.coverage_complete) === Boolean(evRow?.coverage_complete)
      );
    }
    for (const [team,row] of Object.entries(evData.teams || {})) {
      if (row.coverage_complete === true) {
        pass(
          `complete EV has coverage definition: ${product.id}/${format.id}/${team}`,
          typeof row.coverage_definition === "string" && Boolean(row.coverage_definition)
        );
      }
    }
  }
}

const html = read("index.html");
const headers = read("_headers");
const webmanifest = json("site.webmanifest");
pass("webmanifest name is BreakMetric", webmanifest.name === "BreakMetric");
pass("webmanifest standalone display", webmanifest.display === "standalone");
pass("webmanifest theme matches app", webmanifest.theme_color === "#0b1020");
pass("production headers revalidate HTML", headers.includes("/index.html") && headers.includes("Cache-Control: no-cache, must-revalidate"));
pass("production headers revalidate data", headers.includes("/data/*"));
pass("production headers define source cache", headers.includes("/src/*") && headers.includes("max-age=300"));
pass("production headers define manifest cache", headers.includes("/site.webmanifest") && headers.includes("max-age=3600"));
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join("\n");
try {
  new vm.Script(inline, { filename: "index.inline.js" });
  pass("inline application JavaScript compiles", true);
} catch (error) {
  pass("inline application JavaScript compiles", false, error.message);
}

for (const module of [
  "analysisQuality.js",
  "teamComparison.js",
  "evCoverage.js",
  "evWorkQueue.js",
  "evContributionProvenance.js",
  "marketCoverage.js",
  "marketEvidenceQuality.js",
  "marketRecordQuality.js",
  "marketRecordIssues.js",
  "dataFreshness.js",
  "dataLoader.js",
  "errorModel.js",
  "storage.js",
  "spotCurrency.js",
  "urlState.js"
]) {
  pass(
    `required module loaded in UI: ${module}`,
    html.includes(`src/${module}`)
  );
}

pass("atomic spot state enabled", html.includes("breakmetric_spot_state"));
pass("canonical spot USD state enabled", html.includes("canonicalSpotUsd"));
pass("spot state schema v2 persisted", html.includes("BreakMetricSpotCurrency.persistedState"));
pass("FX conversion uses USD canonical basis", html.includes("displayFromCanonicalUsd") && html.includes("canonicalUsdFromDisplay"));
pass("price edits refresh canonical spot basis", html.includes("price.addEventListener(\"input\"") && html.includes("updateCanonicalSpotFromDisplay"));
pass("legacy spot-price writes removed", !html.includes('localStorage.setItem("breakmetric_spot_price"'));
pass(
  "FX conversion is staged",
  html.includes("Resolve both currencies through USD before mutating UI state") &&
  html.includes("Promise.all([") &&
  html.includes("usdFrom") &&
  html.includes("usdTarget")
);
pass("EV beta disclosure present", html.includes("EV and ROI remain beta"));
pass("combined probability approximation disclosed", html.includes("independence approximation"));
pass("skip link present", html.includes('class="skip-link"'));
pass("analysis quality UI present", html.includes('class="quality-grid"'));
pass("EV coverage detail present", html.includes('id="evCoveragePanel"'));
pass("EV work queue present", html.includes('id="evWorkPanel"'));
pass("EV derivation lineage visible", html.includes('id="evDerivationLineage"'));
pass("market source tier visible", html.includes('id="marketSourceTier"'));
pass("market verification EV gap visible", html.includes('id="marketVerificationEvGap"'));
pass("market record sample visible", html.includes('id="marketRecordSample"'));
pass("market record freshness visible", html.includes('id="marketRecordFreshness"'));
pass("market spread alert visible", html.includes('id="marketSpreadAlert"'));
pass("market record integrity visible", html.includes('id="marketRecordIntegrity"'));
pass("market record quality is lazy-loaded", html.includes('marketEvidencePanel.addEventListener("toggle"'));
pass("market evidence detail present", html.includes('id="marketEvidencePanel"'));
pass("freshness panel present", html.includes('id="dataFreshnessPanel"'));
pass("shareable analysis control present", html.includes('id="copyAnalysisLink"'));
pass("retry analysis control present", html.includes('id="retryAnalysisButton"'));
pass("analysis progress UI present", html.includes('class="flow-progress"'));
pass("team comparison panel present", html.includes('id="teamComparisonPanel"'));
pass("team comparison has descriptive caption", html.includes("No value ranking is applied"));
pass("player panel is labelled region", html.includes('role="region" aria-labelledby="playerName"'));
pass("player clear control present", html.includes('id="clearPlayerButton"'));
pass("player details use progressive disclosure", (html.match(/class="player-detail-section"/g) || []).length === 4);
pass("player controls expose aria-expanded", html.includes('"aria-expanded"'));
pass("player grid can receive programmatic focus", html.includes('id="playerGrid" class="player-grid" aria-label="Players" tabindex="-1"'));
pass("player detail resets avoid innerHTML", !html.includes('playerCoverageDetail.innerHTML = ""'));
pass("dataset loader status visible", html.includes('id="dataLoaderStatus"'));
pass("dataset loader metrics visible", html.includes('id="dataLoaderMetrics"'));
pass("browser storage mode visible", html.includes('id="dataStorageStatus"'));
pass("storage abstraction loaded", html.includes('src/storage.js'));
pass("inline app has no direct localStorage calls", !inline.includes("localStorage."));
pass("inline app has no dynamic innerHTML", !inline.includes(".innerHTML"));
pass("safe empty-state renderer present", html.includes("function setEmptyMessage("));
pass("container resets use replaceChildren", html.includes("replaceChildren()"));
pass("bundle loading uses bounded loadMany", html.includes("BreakMetricDataLoader.loadMany(paths") && html.includes("concurrency: 6"));
pass("keyboard shortcuts disclosed", html.includes("Ctrl/⌘K"));
pass("reduced motion supported", html.includes("prefers-reduced-motion"));
pass("webmanifest linked", html.includes('rel="manifest" href="site.webmanifest"'));
pass("Open Graph title present", html.includes('property="og:title"'));
pass("Open Graph description present", html.includes('property="og:description"'));
pass("Open Graph website type present", html.includes('property="og:type" content="website"'));
pass("dark color scheme declared", html.includes('name="color-scheme" content="dark"'));
pass("version is v1.3.0", html.includes("BreakMetric v1.3.0"));

console.log(JSON.stringify({
  result: failures.length ? "fail" : "pass",
  check_count: checks.length,
  failed_count: failures.length,
  failures
}, null, 2));

if (failures.length) process.exit(1);
