# BreakMetric architecture review — steps 1–825

Reviewed: 2026-09-21

## Scope

This review covers the full BreakMetric development chronology through step 825, the browser/runtime architecture, derived-data pipeline, EV model, market-evidence model, validation workflow and the completed first-pass research of the frozen 72-sale Chelsea market sample.

The review does not rewrite historical validation evidence. Where old numbering or snapshots are inconsistent with the later chronology, the canonical development ledger records an explicit mapping.

## Executive result

The core analytical architecture is sound and should be preserved:

1. product catalog
2. product metadata and format manifests
3. checklist and published-odds inputs
4. deterministic probability derivation
5. enumerated EV-eligible inventory
6. valued EV contributions with derivation provenance
7. market records and evidence registry
8. sale-level marketplace verification
9. readiness and ROI gates
10. browser presentation

The largest structural debt is not the analytical model. It is the development/validation layer that grew around it.

## Canonical development chronology

| Canonical steps | Phase | Evidence |
| --- | --- | --- |
| 1–169 | Foundation: product data, odds, probability, market/EV, supply and interactive analysis | commit history |
| 170–174 | v0.3 UI integrity | ui-integrity-v03.json |
| 175–187 | Product/format integrity bridge | commit history |
| 188–207 | v0.4 analysis unit and data status | v0.4 validation manifest |
| 208–227 | v0.5 market evidence integrity | v0.5 validation manifest |
| 228–235 | Market-record migration bridge | commit history |
| 236–285 | v0.6 runtime contracts/state safety | v0.6 validation manifest |
| 286–305 | v0.7 team market registry | v0.7 validation manifest |
| 306–325 | v0.8 team readiness | v0.8 validation manifest |
| 326–355 | v0.9 release/format contracts | v0.9 validation manifest |
| 356–365 | v1.0 reproducible player derivation | v1.0 validation manifest |
| 366–375 | v1.1 analysis provenance | canonical mapping of historical v1.1 manifest |
| 376–395 | v1.1.1 production hardening | release doc + chronology |
| 396 | Break-allocation protection | explicit commit |
| 397–496 | v1.2 n100 | exact v1.2 ledger |
| 497 | Team EV category scope | explicit commit |
| 498–697 | v1.3 n200 | exact v1.3 ledger |
| 698–713 | Post-v1.3 state/runtime hardening | explicit commits/blocks |
| 714–730 | EV denominator and sale-verification architecture | explicit commits/blocks |
| 731–755 | Original locator recovery for all current Chelsea contributions | block manifests |
| 756–776 | Persistent unresolved research state and first research batches | block manifests |
| 777–825 | Complete first-pass research of every originally unresolved frozen sale | block manifests |

The machine-readable version is data/validation/development-ledger-v1.json.

## Historical numbering defect

Both the v1.0 and v1.1 historical manifests declare steps 356–365.

The historical files are retained unchanged because they are evidence of what was recorded at the time. The canonical chronology resolves this as:

- v1.0 = 356–365
- v1.1 = 366–375
- v1.1.1 = 376–395
- explicit break-allocation step = 396

This is a chronology correction, not a rewrite of the historical manifests.

## Current architecture health

### Product and format routing — keep

The product catalog and format manifest structure scales correctly. Ready and pending products/formats are explicit, and analysis routes are format-scoped. This should remain the primary entry point for future releases.

### Probability derivation — keep

Checklist/odds inputs, player derivation and team probability models are separated from the UI. Reproducibility and provenance gates are strong.

### EV pipeline — keep, expand data

The enumerated Hobby EV denominator is 8,896 eligible contribution slots. Only 27 are valued. Chelsea has 27 / 638, leaving 611 Chelsea slots unvalued.

That is now the dominant product-data bottleneck. More UI work does not materially improve decision readiness until EV coverage expands.

### Market evidence — methodology needs a v2 path

The first-pass research phase is complete:

- 72 frozen supporting sales
- 71 recovered original marketplace locators
- 5 original-marketplace verified sales
- 67 unresolved after first pass
- 0 untouched unresolved sales
- 0 fully original-verified contributions

The current fail-closed rule is internally consistent: if a stored market value uses a sale, every sale in that sample must qualify before the contribution is fully original verified.

The first-pass result reveals a structural limitation. Most historical secondary-source sales cannot be reconstructed from the original marketplace. Re-running the same searches indefinitely has low expected value and can make the current frozen sample a permanent ROI blocker.

Recommended market architecture:

- keep the frozen 72-sale dataset immutable as legacy audit evidence;
- keep its current provisional market values for historical reproducibility;
- introduce a separate qualified original-marketplace sample for each contribution;
- define a minimum sample/recency policy for a verified market value;
- allow future directly observed original sales to build that sample without mutating the frozen audit sample;
- do not call a contribution verified until the qualified-sample policy passes.

This preserves the strict evidence philosophy while avoiding dependence on irrecoverable historical marketplace pages.

## Validation architecture

scripts/validate.mjs is approximately 1,347 lines / 62 kB. It contains both current invariants and historical step assertions.

Historical snapshots such as “this block had 1 verified sale” are valid evidence about that point in time, but they must not be reused as mutable current-state requirements. Later legitimate progress has repeatedly required stale-count repairs.

Validation should have five roles:

1. Generators — prove derived outputs are reproducible.
2. Domain validators — validate current product, EV, market and provenance truth.
3. Regression tests — prove fixed bugs stay fixed.
4. Historical manifests — immutable snapshots of implementation blocks.
5. Development ledger — canonical chronology only.

A historical step test should ask “does the evidence introduced by this step still exist?” rather than “is the global aggregate still exactly what it was after this step?”

The policy is recorded in data/methodology/validation-architecture-v1.json.

## Browser architecture

index.html is approximately 4,478 lines / 161 kB. The application still works and is release-gated, so a large refactor should not interrupt the current data priority.

Recommended later split:

- application controller/state transitions;
- focused rendering modules;
- standalone production CSS;
- domain calculation models remain outside the controller;
- keep the static/no-build deployment model unless a build system has a concrete benefit.

## Source-module inventory

There are currently 52 source modules: 24 production runtime modules, 1 CI generator and 27 offline/research modules.

The explicit source inventory is good. Do not delete the 27 offline modules blindly. Each should eventually be marked active-roadmap, archived-reference or removable-legacy.

## Revised priority after step 825

1. EV completeness: move Chelsea from 27/638 toward 638/638 before broadening to many teams.
2. Market evidence v2: design a qualified original-marketplace sample instead of endlessly retrying the same irrecoverable historical pages.
3. Complete Chelsea ROI readiness once EV coverage and verified-market policy both support it.
4. Expand team coverage only after one team works end-to-end.
5. Split the browser monolith without changing model semantics.
6. Split the validation monolith and move historical block assertions out of the current-state validator.
7. Add Playwright/axe and a small performance budget after stable UI boundaries exist.

## Decision

Do not restart the project architecture.

The product/data/probability/EV separation built through steps 1–825 is worth keeping. The next structural work should be targeted: one canonical ledger, snapshot-safe validation rules, a market-evidence v2 path, and later decomposition of the two monolithic files.

The next large product-data effort should return to EV completion rather than continue brute-force retries of the same 67 unresolved historical sales.
