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
- The Hobby EV denominator is now fully enumerated as 8,896 card × modeled-variant contribution slots; Chelsea currently has 27/638 valued slots (4.2% count-based slot coverage).
- EV slot coverage is explicitly count-based and is not an EV-weighted estimate of economic completeness.
- Current EV contributions have deterministic derivation provenance and a priority queue for original-marketplace verification.
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
- Browser persistence uses a resilient local-storage abstraction with a session fallback.
- FX transitions use a last-write-wins operation coordinator so stale async responses cannot overwrite newer currency choices.
- Runtime dependencies are checked before application startup; partial script loads fail closed with a visible error.
- Product-selection continuations are last-write-wins so stale async handlers cannot start analysis for a newer product context.

## Validation

Every pull request and every push to supported release/step branches runs the release gates.

```bash
node scripts/audit-source-modules.mjs
node scripts/generate-ev-eligible-inventory.mjs --check
node scripts/validate-ev-eligible-inventory.mjs
node scripts/generate-v13-pipeline.mjs --check
node scripts/generate-data-version.mjs --check
node scripts/validate-market-records.mjs
node scripts/validate-market-verification-contract.mjs
node scripts/validate-market-verification-tasks.mjs
node scripts/test-market-verification-evidence.mjs
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

The v1.3 development ledger is documented in `docs/v1.3-n200.md` and `data/validation/v13-n200.json`.


## Source-module inventory

All `src/*.js` files are explicitly classified in `data/validation/source-module-inventory-v1.json`.

- **Runtime:** loaded by `index.html`.
- **CI generator:** source-of-truth model logic executed by validation tooling.
- **Offline model library:** retained model/research utilities that are not part of the current browser runtime or mandatory CI path.

CI fails if a source module is unclassified, classified twice, missing from disk, or if the runtime inventory no longer matches the scripts loaded by `index.html`.


## Applying original-marketplace evidence

Prepare an evidence JSON object following `data/methodology/market-verification-ingest-v1.json`, then dry-run it first:

```bash
node scripts/apply-market-verification-evidence.mjs --evidence path/to/evidence.json
```

Only after the dry-run passes, apply the record change:

```bash
node scripts/apply-market-verification-evidence.mjs --evidence path/to/evidence.json --write
node scripts/generate-v13-pipeline.mjs
node scripts/generate-data-version.mjs
```

The ingest command rejects mismatched task identity, date, price, marketplace, serial or original-marketplace locator. The generated verification queue derives status from the supporting sales rather than a contribution-level boolean.
