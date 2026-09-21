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
- Current EV contributions have deterministic derivation provenance and a priority queue for original-marketplace verification.
- Market records are audited for schema, median/sample consistency, evidence integrity and duplicate warnings.
- Market evidence exposes source tier, verification EV gap, sample size, recency and price-spread review flags.
- Team comparison is descriptive and retains canonical team order; it does not rank spots by value.
- Player detail uses progressive disclosure so core probability metrics stay prominent.
- Static analysis data uses same-origin path guards, payload limits, bounded concurrency, cache metrics and in-flight deduplication.
- Browser persistence uses a resilient local-storage abstraction with a session fallback.

## Validation

Every pull request and every push to supported release/step branches runs the release gates.

```bash
node scripts/generate-v13-pipeline.mjs --check
node scripts/validate-market-records.mjs
node scripts/validate-ev-provenance.mjs
node scripts/validate-player-derivation.mjs
node scripts/test-spot-fx.mjs
node scripts/validate.mjs
node scripts/smoke-models.mjs
for file in src/*.js; do node --check "$file"; done
```

The v1.3 development ledger is documented in `docs/v1.3-n200.md` and `data/validation/v13-n200.json`.
