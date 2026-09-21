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
const evPolicy = json("data/methodology/ev-coverage-v2.json");
pass("EV coverage v2 policy schema", evPolicy.schema_version === 2);
pass("EV coverage percentage allowed from enumerated denominator", evPolicy.current_state?.percentage_allowed === true);
pass(
  "EV coverage percentage semantics are count-based",
  evPolicy.current_state?.percentage_semantics === "count-based-slot-coverage-not-ev-weighted"
);
pass(
  "EV coverage global denominator documented",
  Number(evPolicy.denominator?.eligible_contribution_count) === 8896
);
const marketSourcePolicy = json("data/methodology/market-source-policy-v1.json");
const marketVerificationPolicy = json("data/methodology/market-verification-contract-v1.json");
const marketVerificationIngestPolicy = json("data/methodology/market-verification-ingest-v1.json");
const v13PipelineSource = read("scripts/generate-v13-pipeline.mjs");
const marketRecordQualityPolicy = json("data/methodology/market-record-quality-v1.json");
const teamComparisonPolicy = json("data/methodology/team-comparison-v1.json");
const playerDisclosurePolicy = json("data/methodology/player-disclosure-v1.json");
const dataLoaderPolicy = json("data/methodology/data-loader-v3.json");
const runtimeDataVersion = json("data/validation/runtime-data-version-v1.json");
const storagePolicy = json("data/methodology/storage-v1.json");
const safeDomPolicy = json("data/methodology/safe-dom-rendering-v1.json");
pass("safe DOM rendering policy schema", safeDomPolicy.schema_version === 1);
pass(
  "safe DOM policy prohibits dynamic innerHTML",
  safeDomPolicy.prohibited_patterns?.some(value => value.includes("innerHTML"))
);
pass("storage policy schema", storagePolicy.schema_version === 1);
pass("storage policy defines session fallback", storagePolicy.persistence_order?.length === 2);
pass("data loader v3 policy schema", dataLoaderPolicy.schema_version === 3);
pass("analysis loader concurrency capped at six", Number(dataLoaderPolicy.request_policy?.application_concurrency) === 6);
pass("data loader max payload is bounded", Number(dataLoaderPolicy.request_policy?.default_max_bytes) === 5000000);
pass(
  "data loader version manifest configured",
  dataLoaderPolicy.cache_policy?.version_manifest ===
    "data/validation/runtime-data-version-v1.json"
);
pass(
  "data loader invalidates on fingerprint change",
  dataLoaderPolicy.cache_policy?.invalidate_on_fingerprint_change === true
);
pass(
  "data loader verifies top-level load version twice",
  dataLoaderPolicy.cache_policy?.verify_version_before_and_after_top_level_load === true
);
pass("runtime data version schema", runtimeDataVersion.schema_version === 1);
pass(
  "runtime data fingerprint is sha256",
  /^[a-f0-9]{64}$/.test(runtimeDataVersion.fingerprint || "")
);
pass(
  "runtime data version excludes itself",
  runtimeDataVersion.excluded?.includes(
    "data/validation/runtime-data-version-v1.json"
  )
);
pass("player disclosure policy schema", playerDisclosurePolicy.schema_version === 1);
pass("player disclosure has four collapsed detail groups", playerDisclosurePolicy.collapsed_by_default?.length === 4);
pass("team comparison policy schema", teamComparisonPolicy.schema_version === 1);
pass("team comparison remains descriptive", teamComparisonPolicy.default_order === "canonical-checklist-order");
pass("market record quality policy schema", marketRecordQualityPolicy.schema_version === 1);
pass("market record spread review threshold", Number(marketRecordQualityPolicy.spread_alert?.ratio_threshold) === 4);
pass("market verification contract schema", marketVerificationPolicy.schema_version === 1);
pass("market verification ingest policy schema", marketVerificationIngestPolicy.schema_version === 1);
pass(
  "market verification ingest is dry-run by default",
  marketVerificationIngestPolicy.fail_closed_rules?.some(
    value => value.includes("Dry-run is the default")
  ) === true
);
pass(
  "market verification ingest keeps sale prices immutable",
  marketVerificationIngestPolicy.immutable_fields?.includes("sale_price") === true
);
pass(
  "market verification queue generation is sale-derived",
  v13PipelineSource.includes("contributionOriginalVerified") &&
  v13PipelineSource.includes('sale.evidence_status==="original-marketplace-verified"') &&
  !v13PipelineSource.includes("original_marketplace_verified:item.original_marketplace_verified===true")
);
pass(
  "market verification requires all supporting sales",
  marketVerificationPolicy.contribution_rule?.original_marketplace_verified_when?.includes("every realized sale") === true
);
pass(
  "market verification requires original locator",
  marketVerificationPolicy.sale_rule?.qualifying_original_evidence?.some(
    value => value.includes("direct original marketplace URL") || value.includes("stable original marketplace sale identifier")
  ) === true
);
pass("market source policy schema", marketSourcePolicy.schema_version === 1);
pass("market source policy has three tiers", Array.isArray(marketSourcePolicy.source_tiers) && marketSourcePolicy.source_tiers.length === 3);
pass("secondary market evidence remains provisional", marketSourcePolicy.source_tiers?.find(x => x.id === "secondary-source-realized-sale")?.roi_capability === "provisional-only");

const n100 = json("data/validation/v12-n100.json");
pass("n100 step count is exactly 100", n100.step_count === 100 && n100.steps?.length === 100);
pass("n100 starts at step 397", n100.steps?.[0]?.step === 397);
pass("n100 ends at step 496", n100.steps?.[99]?.step === 496);
pass("n100 steps are sequential", n100.steps?.every((row,index)=>row.step === 397 + index));
pass("n100 implementation flags complete", n100.steps?.every(row=>row.implemented === true));

const evDenominatorBlock = json("data/validation/steps-714-718.json");
pass("steps 714-718 count is exactly five", evDenominatorBlock.step_count === 5 && evDenominatorBlock.steps?.length === 5);
pass("steps 714-718 start at 714", evDenominatorBlock.steps?.[0]?.step === 714);
pass("steps 714-718 end at 718", evDenominatorBlock.steps?.[4]?.step === 718);
pass("steps 714-718 are sequential", evDenominatorBlock.steps?.every((row,index)=>row.step === 714 + index));
pass("steps 714-718 implementation flags complete", evDenominatorBlock.steps?.every(row=>row.implemented === true));

const step724 = json("data/validation/step-724.json");
pass("step 724 manifest schema", step724.schema_version === 1);
pass("step 724 id", step724.step === 724);
pass("step 724 implementation complete", step724.implemented === true);

const verificationTaskBlock = json("data/validation/steps-721-723.json");
pass("steps 721-723 count is exactly three", verificationTaskBlock.step_count === 3 && verificationTaskBlock.steps?.length === 3);
pass("steps 721-723 start at 721", verificationTaskBlock.steps?.[0]?.step === 721);
pass("steps 721-723 end at 723", verificationTaskBlock.steps?.[2]?.step === 723);
pass("steps 721-723 are sequential", verificationTaskBlock.steps?.every((row,index)=>row.step === 721 + index));
pass("steps 721-723 implementation flags complete", verificationTaskBlock.steps?.every(row=>row.implemented === true));

const step720 = json("data/validation/step-720.json");
pass("step 720 manifest schema", step720.schema_version === 1);
pass("step 720 id", step720.step === 720);
pass("step 720 implementation complete", step720.implemented === true);

const step719 = json("data/validation/step-719.json");
pass("step 719 manifest schema", step719.schema_version === 1);
pass("step 719 id", step719.step === 719);
pass("step 719 implementation complete", step719.implemented === true);

const step713 = json("data/validation/step-713.json");
pass("step 713 manifest schema", step713.schema_version === 1);
pass("step 713 id", step713.step === 713);
pass("step 713 implementation complete", step713.implemented === true);

const step712 = json("data/validation/step-712.json");
pass("step 712 manifest schema", step712.schema_version === 1);
pass("step 712 id", step712.step === 712);
pass("step 712 implementation complete", step712.implemented === true);
pass("step 712 context keys complete", JSON.stringify(step712.context_keys) === JSON.stringify(["product","format","team"]));

const step711 = json("data/validation/step-711.json");
pass("step 711 manifest schema", step711.schema_version === 1);
pass("step 711 id", step711.step === 711);
pass("step 711 implementation complete", step711.implemented === true);

const runtimeRaceBlock = json("data/validation/steps-706-710.json");
pass("steps 706-710 count is exactly five", runtimeRaceBlock.step_count === 5 && runtimeRaceBlock.steps?.length === 5);
pass("steps 706-710 start at 706", runtimeRaceBlock.steps?.[0]?.step === 706);
pass("steps 706-710 end at 710", runtimeRaceBlock.steps?.[4]?.step === 710);
pass("steps 706-710 are sequential", runtimeRaceBlock.steps?.every((row,index)=>row.step === 706 + index));
pass("steps 706-710 implementation flags complete", runtimeRaceBlock.steps?.every(row=>row.implemented === true));

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
    const evInventory = json(evScope.denominator_source);
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
      evWorkQueue.model === "ev-work-queue-v2" &&
      evWorkQueue.schema_version === 2 &&
      evWorkQueue.tasks?.length === (metadata.teams || []).length * 3 &&
      Number(evWorkQueue.summary?.eligible_contribution_count) === 8896 &&
      Number(evWorkQueue.summary?.valued_contribution_count) === 27
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
      evScope.model === "team-ev-scope-v2" &&
      evScope.schema_version === 2 &&
      evScope.denominator_status !== "not-established"
    );
    pass(
      `EV scope canonical team count: ${product.id}/${format.id}`,
      Object.keys(evScope.teams || {}).length === (metadata.teams || []).length
    );
    pass(
      `EV eligible inventory model: ${product.id}/${format.id}`,
      evInventory.model === "ev-eligible-inventory-v1" &&
      evInventory.schema_version === 1
    );
    pass(
      `EV eligible denominator total: ${product.id}/${format.id}`,
      Number(evInventory.summary?.eligible_contribution_count) === 8896 &&
      Number(evScope.summary?.eligible_contribution_count) === 8896
    );
    pass(
      `EV eligible category denominator totals: ${product.id}/${format.id}`,
      Number(evInventory.summary?.category_eligible_contribution_count?.base_parallels) === 5005 &&
      Number(evInventory.summary?.category_eligible_contribution_count?.inserts) === 1480 &&
      Number(evInventory.summary?.category_eligible_contribution_count?.autographs) === 2411
    );
    pass(
      `EV inventory exclusions remain protected: ${product.id}/${format.id}`,
      Number(evInventory.summary?.excluded_card_count) === 12 &&
      (evInventory.excluded || []).every(row =>
        ["multi-team","team-unresolved"].includes(row.reason)
      )
    );
    for (const team of (metadata.teams || []).map(row => row.name)) {
      const scopeRow = evScope.teams?.[team];
      const evRow = evData.teams?.[team] || null;
      const categories = ["base_parallels","inserts","autographs"];
      const valuedScope = categories.reduce(
        (sum,key) => sum + Number(scopeRow?.categories?.[key]?.valued_contribution_count || 0),
        0
      );
      const eligibleScope = categories.reduce(
        (sum,key) => sum + Number(scopeRow?.categories?.[key]?.eligible_contribution_count || 0),
        0
      );
      const remainingScope = categories.reduce(
        (sum,key) => sum + Number(scopeRow?.categories?.[key]?.remaining_contribution_count || 0),
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
        `EV scope denominator sums: ${product.id}/${format.id}/${team}`,
        eligibleScope === Number(scopeRow?.eligible_contribution_count || 0) &&
        remainingScope === Number(scopeRow?.remaining_contribution_count || 0) &&
        remainingScope === eligibleScope - valuedScope
      );
      pass(
        `EV scope category statuses match denominator: ${product.id}/${format.id}/${team}`,
        categories.every(key => {
          const item=scopeRow?.categories?.[key] || {};
          const eligible=Number(item.eligible_contribution_count || 0);
          const valued=Number(item.valued_contribution_count || 0);
          const expected=
            eligible===0 ? "not-applicable" :
            valued===0 ? "not-started" :
            valued===eligible ? "complete" :
            "partial";
          return item.status===expected;
        })
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
const spotCurrencySource = read("src/spotCurrency.js");
const fxRateSource = read("src/fxRate.js");
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
  "marketVerificationTasks.js",
  "marketRecordQuality.js",
  "marketRecordIssues.js",
  "marketRecordCoordinator.js",
  "dataFreshness.js",
  "dataLoader.js",
  "errorModel.js",
  "storage.js",
  "spotCurrency.js",
  "fxRate.js",
  "fxCoordinator.js",
  "runtimeGuard.js",
  "selectionCoordinator.js",
  "teamReadiness.js",
  "analysisProvenance.js",
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
pass(
  "FX conversion uses USD canonical basis",
  html.includes("BreakMetricSpotCurrency.conversionPlan") &&
  spotCurrencySource.includes("canonicalUsdFromDisplay") &&
  spotCurrencySource.includes("displayFromCanonicalUsd")
);
pass("price edits refresh canonical spot basis", html.includes("price.addEventListener(\"input\"") && html.includes("updateCanonicalSpotFromDisplay"));
pass(
  "clearing price clears canonical spot basis",
  html.includes('price.value = "";') &&
  html.includes("updateCanonicalSpotFromDisplay();") &&
  html.includes('BreakMetricStorage.remove("breakmetric_spot_state")')
);
pass(
  "FX requests have an explicit timeout",
  html.includes("timeoutMs: 8000") &&
  fxRateSource.includes("AbortController") &&
  fxRateSource.includes("controller.abort()")
);
pass(
  "non-USD EV is gated on FX readiness",
  html.includes("canPresentUsdValue") &&
  html.includes('resultNet.textContent = "FX unavailable"')
);
pass(
  "initial FX failure refreshes EV and ROI display",
  html.includes("Non-USD EV and ROI are withheld") &&
  html.includes("updateTeamEv();") &&
  html.includes("updateResults();")
);
pass(
  "FX transitions use last-write-wins coordinator",
  html.includes('fxCoordinator.begin("conversion", nextCurrency)') &&
  html.includes('fxCoordinator.begin("initial", initialCurrency)') &&
  (html.match(/fxCoordinator\.isCurrent\(/g) || []).length >= 5
);
pass(
  "FX pending state withholds converted values",
  html.includes("fxTransitionPending = true") &&
  html.includes("fxTransitionPending = false") &&
  html.includes("fxTransitionPending ||")
);
pass(
  "runtime dependency guard blocks partial startup",
  html.includes("runtimeDependencyReport") &&
  html.includes("BreakMetric could not start because required application modules failed to load.") &&
  html.includes("runtimeDependencyReport.missing.join")
);
pass(
  "market verification runtime fails closed",
  html.includes("BreakMetricMarketEvidenceQuality") &&
  read("src/marketEvidenceQuality.js").includes('verification_status==="verified-original-marketplace"')
);

pass(
  "lazy market records are context-guarded",
  html.includes("BreakMetricMarketRecordCoordinator.create()") &&
  html.includes('productId: currentProduct?.id || ""') &&
  html.includes('formatId: selectedFormat || ""') &&
  html.includes('team: team.value || ""') &&
  (html.match(/marketRecordCoordinator\.isCurrent\(/g) || []).length >= 2 &&
  html.includes("marketRecordCoordinator.invalidate();")
);

pass(
  "manual product selection is continuation-guarded",
  html.includes("selectionCoordinator.begin(item.id)") &&
  html.includes("selectionOperation") &&
  html.includes("selectionCoordinator.isCurrent")
);
pass(
  "initial product bootstrap is continuation-guarded",
  html.includes("selectionCoordinator.begin(currentProduct.id)") &&
  (html.match(/selectionCoordinator\.isCurrent\(/g) || []).length >= 2
);
pass(
  "selection coordinator is runtime-required",
  html.includes('"BreakMetricSelectionCoordinator"')
);
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
pass(
  "EV coverage UI discloses slot semantics",
  html.includes("Count-based eligible-slot coverage") &&
  html.includes("not an EV-weighted estimate of economic completeness")
);
pass(
  "EV coverage UI displays eligible denominator",
  html.includes("eligible slots") &&
  html.includes("slot coverage")
);
pass("EV work queue present", html.includes('id="evWorkPanel"'));
pass("EV derivation lineage visible", html.includes('id="evDerivationLineage"'));
pass("market source tier visible", html.includes('id="marketSourceTier"'));
pass("market verification EV gap visible", html.includes('id="marketVerificationEvGap"'));
pass("market supporting sales visible", html.includes('id="marketSupportingSales"'));
pass("market verified sales visible", html.includes('id="marketVerifiedSales"'));
pass("market pending sales visible", html.includes('id="marketPendingSales"'));
pass("market sale verification share visible", html.includes('id="marketSaleVerificationShare"'));
pass("next sale verification task visible", html.includes('id="marketNextSaleVerification"'));
pass("sale verification task queue visible", html.includes('id="marketSaleTaskQueue"'));
pass(
  "sale verification task UI uses deterministic task model",
  html.includes("BreakMetricMarketVerificationTasks.build(") &&
  html.includes("BreakMetricMarketVerificationTasks.validate(") &&
  html.includes("BreakMetricMarketVerificationTasks.next(") &&
  html.includes("BreakMetricMarketVerificationTasks.label(")
);
pass(
  "sale verification task ordering disclosed",
  html.includes("Contribution priority first, then stored sale order")
);
pass(
  "sale verification UI uses fail-closed progress model",
  html.includes("BreakMetricMarketEvidenceQuality.saleVerificationProgress(records)") &&
  html.includes("saleProgress.original_verified_sale_count") &&
  html.includes("saleProgress.pending_original_sale_count") &&
  html.includes("saleProgress.verification_share")
);
pass(
  "sale verification UI resets stale values",
  html.includes('marketSupportingSales.textContent = "Open panel to load"') &&
  html.includes('marketVerifiedSales.textContent = "—"') &&
  html.includes('marketPendingSales.textContent = "—"') &&
  html.includes('marketSaleVerificationShare.textContent = "—"')
);
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
pass(
  "bundle loading uses bounded versioned loadMany",
  html.includes("BreakMetricDataLoader.loadManyVersioned(paths") &&
  html.includes("concurrency: 6")
);
pass(
  "top-level product and format loads are versioned",
  (html.match(/BreakMetricDataLoader\.loadJsonVersioned\(/g) || []).length >= 2
);
pass(
  "lazy market records use versioned batch loading",
  html.includes("BreakMetricDataLoader.loadManyVersioned(")
);
pass(
  "legacy unversioned top-level loader calls removed",
  !html.includes("BreakMetricDataLoader.loadJson(") &&
  !html.includes("BreakMetricDataLoader.loadMany(")
);
pass(
  "loader diagnostics expose data version",
  html.includes('stats.version.slice(0, 8)') &&
  html.includes("stats.cache_invalidations")
);
pass("keyboard shortcuts disclosed", html.includes("Ctrl/⌘K"));
pass("reduced motion supported", html.includes("prefers-reduced-motion"));
pass("webmanifest linked", html.includes('rel="manifest" href="site.webmanifest"'));
pass("Open Graph title present", html.includes('property="og:title"'));
pass("Open Graph description present", html.includes('property="og:description"'));
pass("Open Graph website type present", html.includes('property="og:type" content="website"'));
pass("dark color scheme declared", html.includes('name="color-scheme" content="dark"'));
pass("version is v1.3.0", html.includes("BreakMetric v1.3.0"));

const step725 = json("data/validation/step-725.json");
pass(
  "step 725 evidence template manifest",
  step725.step === 725 &&
  step725.implemented === true &&
  step725.title === "Generate deterministic pending-sale evidence templates"
);
pass(
  "evidence template CLI documented",
  read("README.md").includes("create-market-verification-evidence-template.mjs")
);
pass(
  "evidence template generator present",
  exists("scripts/create-market-verification-evidence-template.mjs") &&
  exists("scripts/lib/market-verification-template.mjs") &&
  exists("scripts/test-market-verification-template.mjs")
);

const step726 = json("data/validation/step-726.json");
const marketEvidenceIngestSource =
  read("scripts/lib/market-verification-evidence.mjs");
pass(
  "step 726 marketplace locator hardening manifest",
  step726.step === 726 &&
  step726.implemented === true &&
  step726.title === "Harden original-marketplace sale locators"
);
pass(
  "eBay stable sale ids are format-validated",
  marketEvidenceIngestSource.includes("stableSaleIdMatchesMarketplace") &&
  marketEvidenceIngestSource.includes("/^\\d{9,15}$/")
);
pass(
  "eBay direct evidence requires a listing item id",
  marketEvidenceIngestSource.includes("ebayItemIdFromUrl") &&
  marketEvidenceIngestSource.includes("direct marketplace URL is not a qualifying sale listing")
);
pass(
  "direct URL and stable sale id disagreement fails closed",
  marketEvidenceIngestSource.includes("direct marketplace URL and stable sale id disagree")
);

const step727 = json("data/validation/step-727.json");
const marketIdentitySource =
  read("scripts/lib/market-card-identity.mjs");
const activeProductIdentity = json(
  "data/products/2026-topps-chrome-premier-league.json"
).market_identity || {};
pass(
  "step 727 exact product identity manifest",
  step727.step === 727 &&
  step727.implemented === true &&
  step727.title === "Require exact product identity for market verification"
);
pass(
  "active product defines strict market identity aliases",
  activeProductIdentity.canonical_series === "2026 Topps Chrome Premier League" &&
  Array.isArray(activeProductIdentity.accepted_series_aliases) &&
  activeProductIdentity.accepted_series_aliases.includes("2025-26 Topps Chrome Premier League") &&
  !activeProductIdentity.accepted_series_aliases.includes("2025-26 Topps Premier League")
);
pass(
  "market evidence requires listing product identity",
  marketEvidenceIngestSource.includes("assessListingIdentity") &&
  marketIdentitySource.includes("listing identity series does not match target product family") &&
  marketIdentitySource.includes("listing identity card_number does not match market record") &&
  marketIdentitySource.includes("listing identity parallel does not match market record") &&
  marketIdentitySource.includes("listing identity print_run does not match market record")
);
pass(
  "market record audit rechecks stored original identity",
  read("scripts/validate-market-records.mjs").includes("assessListingIdentity") &&
  read("scripts/validate-market-records.mjs").includes("original identity invalid")
);

const step728 = json("data/validation/step-728.json");
const candidateSource =
  read("scripts/lib/market-verification-candidate.mjs");
const templateSource =
  read("scripts/lib/market-verification-template.mjs");
const marketRecordAuditSource =
  read("scripts/validate-market-records.mjs");
pass(
  "step 728 candidate recovery manifest",
  step728.step === 728 &&
  step728.implemented === true &&
  step728.title === "Add fail-closed market candidate recovery gate"
);
pass(
  "candidate recovery separates identity from historical sale",
  candidateSource.includes('"identity-mismatch"') &&
  candidateSource.includes('"identity-match-sale-unresolved"') &&
  candidateSource.includes('"historical-sale-match"') &&
  candidateSource.includes("candidate listing is not confirmed as a sold listing")
);
pass(
  "only historical sale candidates can become evidence",
  candidateSource.includes("eligible_for_evidence:eventMatched") &&
  candidateSource.includes("validateEvidence")
);
pass(
  "market identity logic is centralized",
  marketEvidenceIngestSource.includes('from "./market-card-identity.mjs"') &&
  templateSource.includes('from "./market-card-identity.mjs"') &&
  marketRecordAuditSource.includes('from "./lib/market-card-identity.mjs"') &&
  !marketEvidenceIngestSource.includes("function identityText(") &&
  !marketRecordAuditSource.includes("const identityText=")
);
pass(
  "candidate recovery CLI and methodology present",
  exists("scripts/assess-market-verification-candidate.mjs") &&
  exists("scripts/test-market-verification-candidate.mjs") &&
  exists("data/methodology/market-verification-candidate-v1.json") &&
  read("README.md").includes("Assessing recovered marketplace candidates")
);

const step729 = json("data/validation/step-729.json");
const candidate0 = json(
  "data/market/2026-topps-chrome-premier-league/candidates/CA-EV-gold-refractor-auto-sale-0.json"
);
const candidate1 = json(
  "data/market/2026-topps-chrome-premier-league/candidates/CA-EV-gold-refractor-auto-sale-1.json"
);
pass(
  "step 729 recovered locator manifest",
  step729.step === 729 &&
  step729.implemented === true &&
  step729.recovered_candidate_count === 2
);
pass(
  "secondary-source candidate provenance cannot promote evidence",
  candidateSource.includes("candidate card identity is not observed from original marketplace") &&
  candidateSource.includes("candidate sale event is not observed from original marketplace")
);
pass(
  "recovered CA-EV candidates remain unresolved",
  [candidate0,candidate1].every(row =>
    row.assessment_status === "identity-match-sale-unresolved" &&
    row.identity_source_kind === "secondary-source" &&
    row.observed_sale?.source_kind === "secondary-source" &&
    row.original_marketplace_verified !== true &&
    row.evidence_status !== "original-marketplace-verified"
  )
);
pass(
  "recovered eBay locator ids are persisted",
  candidate0.source_sale_id === "366181936319" &&
  candidate1.source_sale_id === "157681835833"
);
pass(
  "persisted candidate validator is release-gated",
  exists("scripts/validate-market-verification-candidates.mjs") &&
  read(".github/workflows/validate.yml").includes(
    "node scripts/validate-market-verification-candidates.mjs"
  )
);

const step730 = json("data/validation/step-730.json");
const goldCandidate0 = json(
  "data/market/2026-topps-chrome-premier-league/candidates/68-gold-refractor-sale-0.json"
);
const goldCandidate1 = json(
  "data/market/2026-topps-chrome-premier-league/candidates/68-gold-refractor-sale-1.json"
);
pass(
  "step 730 Gold Refractor recovery manifest",
  step730.step === 730 &&
  step730.implemented === true &&
  step730.contribution?.card_id === "68-gold-refractor" &&
  step730.recovered_candidates?.length === 2
);
pass(
  "Gold Refractor eBay locator ids are persisted",
  goldCandidate0.source_sale_id === "177989347985" &&
  goldCandidate1.source_sale_id === "177847689668"
);
pass(
  "Gold Refractor candidates remain unresolved secondary observations",
  [goldCandidate0,goldCandidate1].every(row =>
    row.assessment_status === "identity-match-sale-unresolved" &&
    row.identity_source_kind === "secondary-source" &&
    row.observed_sale?.source_kind === "secondary-source" &&
    row.original_marketplace_verified !== true &&
    row.evidence_status !== "original-marketplace-verified"
  )
);
pass(
  "observed serial can be retained without mutating stored sale",
  goldCandidate0.observed_sale?.serial_copy === "10/50" &&
  candidateSource.includes(
    'text(sale.serial_copy)\n        ? text(observed.serial_copy)===text(sale.serial_copy)\n        : true'
  )
);

const marketBlock731740 = json("data/validation/steps-731-740.json");
const marketSteps731740 = Array.from(
  {length:10},
  (_,index)=>json(`data/validation/step-${731+index}.json`)
);
const prismMarketRecord = json(
  "data/market/2026-topps-chrome-premier-league/68-estevao-willian-prism-refractor.json"
);
const prismVerifiedCandidate = json(
  "data/market/2026-topps-chrome-premier-league/candidates/68-prism-refractor-sale-0.json"
);
const prismCadCandidate = json(
  "data/market/2026-topps-chrome-premier-league/candidates/68-prism-refractor-sale-1.json"
);
const yellowCandidate = json(
  "data/market/2026-topps-chrome-premier-league/candidates/68-yellow-refractor-sale-0.json"
);
pass(
  "steps 731-740 market verification block is sequential",
  marketBlock731740.step_count === 10 &&
  marketBlock731740.steps?.every((step,index)=>step===731+index) &&
  marketSteps731740.every((row,index)=>
    row.step===731+index && row.implemented===true
  )
);
pass(
  "steps 731-740 recovered 45 of 46 marketplace locators",
  marketBlock731740.supporting_sale_count === 46 &&
  marketBlock731740.recovered_original_locator_count === 45 &&
  marketBlock731740.persisted_candidate_count === 46 &&
  marketSteps731740.reduce(
    (sum,row)=>sum+Number(row.result?.recovered_original_locator_count||0),
    0
  ) === 45
);
pass(
  "steps 731-740 produce first original-verified supporting sale",
  marketBlock731740.original_verified_sale_count === 1 &&
  prismMarketRecord.sales?.[0]?.source_sale_id === "158227124444" &&
  prismMarketRecord.sales?.[0]?.original_marketplace_verified === true &&
  prismMarketRecord.sales?.[0]?.evidence_status ===
    "original-marketplace-verified" &&
  prismMarketRecord.sales?.[0]?.original_marketplace_identity?.print_run ===
    null &&
  prismMarketRecord.evidence_summary?.original_marketplace_verified_sale_count ===
    1 &&
  prismMarketRecord.evidence_summary?.secondary_source_realized_sale_count ===
    29 &&
  prismMarketRecord.calculated_market_value?.status ===
    "provisional-mixed-source"
);
pass(
  "Prism original candidate is exact historical sale match",
  prismVerifiedCandidate.assessment_status === "historical-sale-match" &&
  prismVerifiedCandidate.identity_source_kind === "original-marketplace" &&
  prismVerifiedCandidate.observed_sale?.source_kind ===
    "original-marketplace" &&
  prismVerifiedCandidate.source_sale_id === "158227124444"
);
pass(
  "cross-currency Prism sale remains unresolved",
  prismCadCandidate.assessment_status === "identity-match-sale-unresolved" &&
  prismCadCandidate.identity_source_kind === "original-marketplace" &&
  prismCadCandidate.observed_sale?.source_kind === "secondary-source" &&
  prismMarketRecord.sales?.[1]?.original_marketplace_verified === false
);
pass(
  "Yellow sale has no guessed marketplace locator",
  yellowCandidate.assessment_status === "identity-match-sale-unresolved" &&
  !yellowCandidate.source_sale_id &&
  !yellowCandidate.direct_marketplace_url
);
pass(
  "unnumbered market identity remains null-safe",
  marketIdentitySource.includes("expectedPrintRun") &&
  marketIdentitySource.includes("observedPrintRun") &&
  read("scripts/lib/market-verification-template.mjs").includes(
    "record.serial_numbering===null"
  ) &&
  read("scripts/validate-market-verification-candidates.mjs").includes(
    "record.serial_numbering===null"
  )
);
pass(
  "canonical eBay Spain host is accepted",
  marketEvidenceIngestSource.includes('"ebay.es"')
);
pass(
  "cross-currency original-sale matching requires provenance",
  json("data/methodology/market-verification-candidate-v1.json")
    .safety_rules?.some(value=>
      value.includes("currency-conversion provenance")
    ) === true
);
pass(
  "README reports current market verification progress",
  read("README.md").includes("56 of the 72 stored supporting sales") &&
  read("README.md").includes("2 of 72 sales are fully original-marketplace verified")
);

const marketBlock741745 = json("data/validation/steps-741-745.json");
const marketSteps741745 = [741,742,743,744,745].map(step=>
  json(`data/validation/step-${step}.json`)
);
const tealMarketRecord = json(
  "data/market/2026-topps-chrome-premier-league/68-estevao-willian-teal-refractor.json"
);
const tealVerifiedCandidate = json(
  "data/market/2026-topps-chrome-premier-league/candidates/68-teal-refractor-sale-1.json"
);
pass(
  "steps 741-745 market verification block is complete",
  marketBlock741745.step_count === 5 &&
  marketBlock741745.steps?.join(",") === "741,742,743,744,745" &&
  marketSteps741745.every(row=>row.implemented===true)
);
pass(
  "steps 741-745 recovered all seven locators",
  marketBlock741745.supporting_sale_count === 7 &&
  marketBlock741745.recovered_original_locator_count === 7 &&
  marketSteps741745.reduce(
    (sum,row)=>sum+Number(row.result?.recovered_original_locator_count||0),
    0
  ) === 7
);
pass(
  "Teal 185 of 299 is second original-verified supporting sale",
  tealMarketRecord.sales?.[1]?.source_sale_id === "236738825291" &&
  tealMarketRecord.sales?.[1]?.original_marketplace_verified === true &&
  tealMarketRecord.sales?.[1]?.evidence_status ===
    "original-marketplace-verified" &&
  tealMarketRecord.evidence_summary?.original_marketplace_verified_sale_count === 1 &&
  tealVerifiedCandidate.assessment_status === "historical-sale-match" &&
  tealVerifiedCandidate.observed_sale?.serial_copy === "185/299"
);
pass(
  "canonical eBay Singapore host is accepted",
  marketEvidenceIngestSource.includes('"ebay.com.sg"')
);
pass(
  "original 72-sale verification scope is frozen",
  json("data/methodology/market-verification-candidate-v1.json")
    .safety_rules?.some(value=>value.includes("scope-frozen")) === true &&
  marketBlock741745.source_drift?.current_discovery_source_sale_count === 4 &&
  marketBlock741745.source_drift?.stored_supporting_sale_count === 1
);
pass(
  "README reports updated market verification progress",
  read("README.md").includes("56 of the 72 stored supporting sales") &&
  read("README.md").includes("2 of 72 sales are fully original-marketplace verified")
);

console.log(JSON.stringify({
  result: failures.length ? "fail" : "pass",
  check_count: checks.length,
  failed_count: failures.length,
  failures
}, null, 2));

if (failures.length) process.exit(1);
