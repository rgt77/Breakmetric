# BreakMetric

BreakMetric is a sports-card case-break analysis platform built around published manufacturer odds, normalized checklists, player/team probability models and evidence-gated expected value.

## Current release

**v1.1.1 hardening**

- Product flow: release → box format → team → player.
- 2026 Topps Chrome Premier League Hobby is the active analysis-ready dataset.
- Probability analysis is available from the committed Hobby odds/checklist model.
- EV and ROI remain beta and are explicitly gated by coverage and market-source verification.
- Spot price and currency are stored atomically; failed FX requests do not mutate the user's price.
- Runtime contracts block analysis when product, format or dataset integrity fails.

## Validation

Every push and pull request runs the BreakMetric validation workflow.

```bash
node scripts/validate.mjs
```

The validator checks JSON parsing, ready-product/format routes, case-pack-card arithmetic, inline application JavaScript, currency hardening invariants and core disclosure requirements. Source files are also syntax-checked in CI.

See `docs/v1.1.1-hardening.md` for the current release gates.
