# BreakMetric

BreakMetric is a sports-card case-break analysis platform built around published manufacturer odds, normalized checklists, player/team probability models and evidence-gated expected value.

## Current release

**v1.2.0**

- Product flow: release → box format → team → optional player drill-down → spot price.
- 2026 Topps Chrome Premier League Hobby is the active analysis-ready dataset.
- Probability, EV coverage, market evidence and ROI readiness are displayed as separate states.
- EV and ROI remain beta and are explicitly gated by coverage and market-source verification.
- Multi-team cards are excluded from team EV until an explicit break-allocation rule is defined.
- Analysis selections can be shared through the URL.
- Static datasets use bounded retry, request timeout, in-memory caching and in-flight deduplication.
- Blocking analysis-load errors can be retried without reloading the page.
- Dataset validation dates and market-registry dates are visible in provenance.
- Spot price and currency are persisted atomically.

## Validation

Every pull request and every push to `main` runs three release gates:

```bash
node scripts/validate.mjs
node scripts/smoke-models.mjs
for file in src/*.js; do node --check "$file"; done
```

The v1.2 development ledger is documented in `docs/v1.2-n100.md` and `data/validation/v12-n100.json`.
