# BreakMetric

BreakMetric is a sports-card case-break analysis platform built around published manufacturer odds, normalized checklists, player/team probability models and evidence-gated expected value.

## Current release

**v1.3.0**

- Product flow: release → box format → team → optional player drill-down → spot price.
- 2026 Topps Chrome Premier League Hobby remains the active analysis-ready dataset.
- Probability, EV coverage, market evidence and ROI readiness remain separate states.
- EV and ROI remain beta until coverage and original-marketplace verification gates pass.
- Multi-team cards remain excluded from team EV until an explicit break-allocation rule exists.
- EV work is now tracked across 20 teams × base parallels, inserts and autographs.
- The Hobby EV denominator is now fully enumerated as 8,896 card × modeled-variant contribution slots; Chelsea currently has 33/638 valued slots (5.1724% count-based slot coverage).
- EV slot coverage is explicitly count-based and is not an EV-weighted estimate of economic completeness.
- Current EV contributions have deterministic derivation provenance and a priority queue for original-marketplace verification.
- Market verification has now recovered original marketplace locators for 71 of the 72 stored supporting sales; 5 of 72 sales are fully original-marketplace verified. All 72 frozen supporting sales now have exactly one persisted candidate record. Locator recovery alone does not imply sale verification.
- All 27 current Chelsea contribution priority ranks have now been processed for the frozen 72-sale market-verification pass. Five supporting sales are directly original-verified: the 2026-09-03 Estêvão #68 Prism sale, the 2026-04-13 Estêvão #68 Teal 185/299 sale, and three additional Estêvão #68 Prism sales whose original eBay timestamps normalize to the frozen canonical UTC dates.
- Market records are audited for schema, median/sample consistency, evidence integrity and duplicate warnings.
- Original-marketplace verification is sale-derived and fail-closed: every realized sale used by a contribution's stored market-value sample must have qualifying original evidence before that contribution can count as original verified.
- Sale-level original-marketplace verification progress is visible in the Market evidence panel, including supporting sales, verified sales, pending sales and verification share.
- Sale verification tasks are derived deterministically from the verification queue plus market records, ordered by contribution priority and stored sale order; the active team's next pending task is shown in the Market evidence panel.
- Original-marketplace evidence can be dry-run before writing. Evidence must match task identity, sale date, price, marketplace and serial, and verification never changes the realized-sale sample.
- Market evidence exposes source tier, verification EV gap, sample size, recency and price-spread review flags.
- Team comparison is descriptive and retains canonical team order; it does not rank spots by value.
- Player detail uses progressive disclosure so core probability metrics stay prominent.
- Static analysis data uses same-origin path guards, payload limits, bounded concurrency, cache metrics and in-flight deduplication.
- Runtime JSON caching is fingerprint-versioned; cache is invalidated when deployed data changes, and top-level loads must observe a stable fingerprint before activation.
- Versioned runtime JSON requests also carry the fingerprint in the network URL and bypass browser HTTP cache, preventing mixed deployment generations on CDN/mobile clients.
- Browser persistence uses a resilient local-storage abstraction with a session fallback.
- FX transitions use a last-write-wins operation coordinator so stale async responses cannot overwrite newer currency choices.
- Runtime dependencies are checked before application startup; partial script loads fail closed with a visible error.
- Product-selection continuations are last-write-wins so stale async handlers cannot start analysis for a newer product context.

## Validation

Every pull request and every push to supported release/step branches runs the release gates.

```bash
node scripts/validate-development-ledger.mjs
node scripts/audit-source-modules.mjs
node scripts/generate-ev-eligible-inventory.mjs --check
node scripts/validate-ev-eligible-inventory.mjs
node scripts/generate-chelsea-market-anchor.mjs --check
node scripts/generate-chelsea-ev-completion-queue.mjs --check
node scripts/validate-chelsea-ev-completion-queue.mjs
node scripts/validate-ev-valuation-research.mjs
node scripts/generate-v13-pipeline.mjs --check
node scripts/validate-market-automation-config.mjs
node scripts/validate-collector-ops.mjs
node scripts/test-continuous-market-collector.mjs
node scripts/test-collector-autonomy.mjs
node scripts/test-collector-end-to-end.mjs
node scripts/check-collector-health.mjs
node scripts/generate-automated-valuation-candidates.mjs --output /tmp/automated-valuation-candidates.json
node scripts/generate-data-version.mjs --check
node scripts/validate-market-records.mjs
node scripts/validate-market-verification-contract.mjs
node scripts/validate-market-verification-tasks.mjs
node scripts/test-market-verification-evidence.mjs
node scripts/test-market-verification-template.mjs
node scripts/test-market-verification-candidate.mjs
node scripts/validate-market-verification-candidates.mjs
node scripts/validate-ev-provenance.mjs
node scripts/validate-player-derivation.mjs
node scripts/test-spot-fx.mjs
node scripts/test-runtime-races.mjs
node scripts/test-selection-race.mjs
node scripts/test-market-record-race.mjs
node scripts/test-data-cache-version.mjs
node scripts/validate.mjs
node scripts/smoke-models.mjs
for file in src/*.js; do node --check "$file"; done
```

The canonical development ledger now extends through step 889 in `data/validation/development-ledger-v1.json`. The architecture review remains the immutable steps 1–825 snapshot in `docs/architecture-review-steps-1-825.md`.


## Chelsea EV completion queue

Step 826 expands the category-level EV work queue into a deterministic slot-level queue for Chelsea. Step 826 started with **611** unvalued Chelsea contribution slots. After steps 827–838, **605** remain: **222 base parallels, 121 inserts and 262 autographs**. The queue is stored at `data/derived/2026-topps-chrome-premier-league-hobby-chelsea-ev-completion-queue-v1.json`.

Each task combines published-odds expected copies per case with a dynamically regenerated median market anchor derived from the currently valued Chelsea contributions. The resulting `economic_priority_proxy_usd` is only a research-order heuristic; it is not a predicted market value, EV contribution or ROI input. Actual EV remains locked until the slot receives its own exact-identity market sample and normal provenance. Previously researched tasks with no exact realized sales are retained but moved behind untouched work.

## Phase-2 valuation progress

Steps 827–838 researched the first twelve Chelsea completion tasks. Six produced exact-identity provisional raw-sale valuations and six remained unvalued because no exact realized-sale sample was available. Step 838 begins the broader-player pass with Liam Delap #62 Refractor. Chelsea therefore advances to **33 / 638 valued slots (5.1724%)**, with partial EV **$53.1077 per Hobby case**. The legacy v1 market-verification population remains frozen at 27 contributions / 72 supporting sales; Phase-2 records do not silently expand that audit.


## Hobby runtime contract

Steps 854–856 add the browser's exact `validateAnalysisBundle` path to CI. This exposed and fixed a mismatch between current EV coverage and the intentionally frozen v1 market-verification population. The runtime now loads `market-verification-scope-v1.json` explicitly and requires the v1 verification queue to match that frozen 27-contribution scope exactly, while still confirming that every frozen item remains present in current EV data.

`runtimeContracts.js` is versioned as v2 in the HTML so existing mobile/browser caches cannot retain the pre-fix validator.

## Continuous market collection

Steps 839–850 replace the one-manual-step-per-card approach with a reusable market-data pipeline. The collector expands the complete EV-eligible release inventory directly from normalized checklists, odds and committed provenance, so collection is no longer limited to Chelsea or to a hand-maintained research queue.

Two scheduled lanes are installed:

- **Fast lane:** GitHub Actions runs every 15 minutes and advances a persistent cursor through a deterministic team-then-subject round-robin queue. Queue position survives restarts/missed schedules, and team/player caps prevent concentration.
- **Bulk lane:** a daily SportsCardsPro CSV import can refresh the full release in one pass when a subscriber-specific Download Price List URL is configured.

The official SportsCardsPro API is rate-limited to one request per second, so the fast lane enforces a minimum 1100 ms request interval. The provider also recommends CSV downloads for large datasets and states that those files are refreshed once per day. Live collection therefore uses the API for frequent priority sampling and CSV for broad daily coverage.

The collector is installed fail-closed. To activate live provider data, configure these GitHub Actions repository secrets:

- `SPORTSCARDSPRO_TOKEN` — paid SportsCardsPro API token.
- `SPORTSCARDSPRO_CSV_URL` — optional subscriber-specific CSV download URL for daily bulk sync.
- `SPORTSCARDSPRO_COMMERCIAL_SHARING_APPROVED` — set to `true` only after express written permission/commercial licensing allows SportsCardsPro-derived data to be persisted for the public BreakMetric application.

Missing credentials do not fabricate values or mutate canonical EV. The scheduled job exits cleanly until credentials are present.

Collected current-price observations are stored separately from realized-sale market records. Automated valuation candidates use the following hierarchy: **A** exact realized sales, **B** exact provider current price, **C** same-subject/same-category model, **D** team/product category model, **E** unknown. B/C/D values remain candidate/model data and do not silently enter canonical EV or original-marketplace verification.

Steps 860–875 harden this into the Phase-1 autonomous collector. Live runs persist a bounded operational journal, cumulative metrics, coverage, exception state, price-change history, quarantine state and soak/acceptance progress under `ops/collector/`. These operational files are deliberately outside runtime `data/`, so collector telemetry does not invalidate browser runtime-data fingerprints. Repeated blocked-config runs remain idempotent; live runs persist their operational checkpoint even when prices themselves are unchanged.

The collector retries transient provider/network failures with deterministic exponential backoff. Suspicious price ranges or extreme price changes are quarantined instead of silently entering provider observations. A separate hourly watchdog detects a previously configured fast lane that has gone stale.

Operational status is available at `/collector-status.html` (noindex, not linked from the customer flow). The first successful live fast-lane run starts an automatic 24-hour soak test. Phase 1 is accepted only after the machine-readable criteria in `ops/collector/acceptance-v1.json` pass, at which point the contract becomes `continuous-market-collection-v1`.

**Current audited provider state:** the scheduled workflows are installed, but the latest audited fast-lane and bulk-lane runs had empty `SPORTSCARDSPRO_TOKEN` and `SPORTSCARDSPRO_CSV_URL` environments, and commercial sharing is not approved in collector state. Therefore the correct Phase-1 operational state is `pending-live-provider`, not `healthy`. Live persistence and the soak clock start automatically only after the fast-lane token is configured **and** `SPORTSCARDSPRO_COMMERCIAL_SHARING_APPROVED=true` is explicitly configured following written permission/commercial licensing. No manual Phase-1 start command is required after those prerequisites exist.


## Valuation confidence gates

Step 888 makes modeled valuation fail closed. Tier C/D candidates must pass both a release-level calibration gate and a candidate-level evidence gate before they may expose a modeled market value or modeled EV. The current Step-887 baseline does **not** pass: it has only one team in the holdout population and a 67.96% median absolute percentage error, versus the deployment policy requiring at least three teams and at most 35% median absolute percentage error. Therefore current C/D proposals are suppressed to Tier E/unknown with null value/EV while retaining diagnostic gate reasons. Tier B direct-provider candidates and canonical EV are unaffected.

## Simplified calculator flow

Step 889 removes the redundant selected-state context summary from the calculator and keeps the visible interaction order focused on **box type → team → player → spot price**. The release chooser remains hidden while only one analysis-ready release is active. Root HTML is served with `Cache-Control: no-store` so mobile browsers do not continue rendering an older selection UI after deployment.

## Valuation model backtest

Step 887 adds a deterministic leave-one-out backtest for Tier C/D valuation. Each known canonical realized-sale market value is hidden in turn, removed from the training evidence, and predicted with the same shared C/D model used by the automated candidate generator. An exact provider observation for the same task is also excluded to prevent self-leakage. CI reports prediction coverage, MAE, median absolute error, mean/median absolute percentage error and signed bias, with breakdowns by tier, model basis and card category. These metrics are calibration evidence only and do not enable modeled EV; confidence gates are defined separately in the next step.

## Automated valuation tier separation

Step 886 hardens the automated valuation candidate contract. Exact provider current prices (Tier B) are now machine-classified as direct-provider observations, while Tier C/D values are machine-classified as modeled estimates. Every candidate exposes an evidence breakdown separating canonical realized-sale observations from exact provider current-price observations. Candidate EV summaries are split into direct-provider and modeled totals; any combined total is explicitly labeled non-canonical.

## Repository cleanup

Steps 876–885 remove dormant code accumulated during earlier model experimentation. The `src/` directory now contains only 24 browser-runtime modules plus the single `playerDerivation.js` CI-generator module. Twenty-seven offline/dormant model modules were removed after confirming they were neither browser-loaded nor imported by the active script toolchain. The obsolete time-based rotating-shard collector path was also removed in favor of the persistent-cursor collector introduced in Phase 1.

The source-module audit now rejects dormant/offline roles, preventing unused application modules from silently accumulating again. Runtime behavior, canonical EV and market evidence semantics are unchanged by this cleanup.

## Source-module inventory

All `src/*.js` files are explicitly classified in `data/validation/source-module-inventory-v1.json`.

- **Runtime:** loaded by `index.html`.
- **CI generator:** source-of-truth model logic executed by validation tooling.

The old dormant/offline model library has been removed. `src/` now contains only code with an active runtime or CI-generation role. CI fails if a source module is unclassified, classified twice, missing from disk, or if the runtime inventory no longer matches the scripts loaded by `index.html`.


## Assessing recovered marketplace candidates

A marketplace search hit is not evidence by itself. Assess it first:

```bash
node scripts/assess-market-verification-candidate.mjs --candidate path/to/candidate.json
```

Candidate recovery is deliberately two-stage. First, the exact product/card identity must match the target product family, card number, parallel, print run and player. Second, the marketplace page must prove the exact stored historical sale event: a sold listing with matching date, price, marketplace and serial copy. Both the card identity and the sale-event observations must come from the original marketplace (or an equivalent original-source record); a secondary-source report plus a recovered marketplace item ID is still unresolved. An active relisting of the exact physical card therefore remains `identity-match-sale-unresolved`. If an original listing is denominated in a different currency from the stored canonical sale value, promotion also requires explicit traceable FX/conversion provenance; a secondary-source converted USD amount is not sufficient.

Only a `historical-sale-match` candidate can be promoted to evidence:

```bash
node scripts/assess-market-verification-candidate.mjs \
  --candidate path/to/candidate.json \
  --emit-evidence evidence/verified-sale.json
```

Candidate assessment never mutates market records, sale prices, EV or verification flags. The emitted evidence must still pass the normal fail-closed evidence validator before it can be written. The original 72 supporting-sale scope is frozen during this verification pass; later sales discovered at the source are tracked as source drift rather than silently changing the sample. CI now requires one and only one persisted candidate task for every frozen supporting sale.

Unresolved candidates also carry persistent research state. Failed original-source recovery attempts are recorded on the candidate instead of being discarded, and `node scripts/next-market-verification-research-task.mjs` deterministically selects the next unresolved sale. Never-researched candidates are prioritized ahead of previously attempted candidates at the same contribution priority, preventing repeated dead-end work while preserving fail-closed verification. The first-pass original-source research phase is complete as of step 825. All 70 sales that were unresolved when the research phase began have now been touched: 3 were promoted through qualifying original evidence and 67 remain unresolved. Of those 67, 63 are `original-source-unavailable` and 4 are `historical-event-unresolved`; there are no untouched unresolved sales left in the frozen 72-sale scope.

## Preparing original-marketplace evidence

Generate the next deterministic pending-sale evidence template instead of transcribing task identity by hand:

```bash
node scripts/create-market-verification-evidence-template.mjs --output evidence/next-sale.json
```

You can scope to a team with `--team "Chelsea"` or select an exact pending `--task-id`. The generator derives task identity, sale index, date, price, marketplace and serial from the current verification queue and market record. Original-marketplace locator fields and `verified_at` are intentionally blank, so an untouched template cannot pass ingest validation.

## Applying original-marketplace evidence

Complete the generated template with a qualifying `direct_marketplace_url` or `source_sale_id` and `verified_at`. You can also prepare an evidence JSON object directly following `data/methodology/market-verification-ingest-v1.json`. Then dry-run it first:

```bash
node scripts/apply-market-verification-evidence.mjs --evidence path/to/evidence.json
```

Only after the dry-run passes, apply the record change:

```bash
node scripts/apply-market-verification-evidence.mjs --evidence path/to/evidence.json --write
node scripts/generate-v13-pipeline.mjs
node scripts/generate-data-version.mjs
```

The ingest command rejects mismatched task identity, product identity, card number, parallel, print run, player, date, price, marketplace, serial or original-marketplace locator. For eBay, direct evidence must identify an actual `/itm/` listing and standalone stable IDs must use a plausible numeric item-number format; if both URL and ID are supplied, they must agree. The listing must also prove the exact target product family: `Topps Premier League` and `Topps Chrome Premier League` are distinct and cannot cross-verify, even when the player and serial copy match. A later active re-listing of the same serial-numbered card is research evidence only and does not by itself verify an earlier sale event. The generated verification queue derives status from the supporting sales rather than a contribution-level boolean.
