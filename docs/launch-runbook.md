# BreakMetric launch runbook

## Release gate
BreakMetric 1.0 may be marked release-ready only when `data/validation/launch-readiness-v1.json` has no required blockers and `scripts/validate-launch-readiness.mjs` passes.

## Pre-deploy
1. Run the repository syntax and codebase audit workflow.
2. Run full-system, production-hardening, release-registry, EV/data-quality, performance and mobile validators.
3. Confirm the active release remains the intended release and pending releases remain fail-closed.
4. Confirm live market collection has a trustworthy fresh checkpoint.
5. Complete browser/device E2E for the customer path Release → Box → Team → optional Player → Spot price → Analysis.

## Deploy
Deploy only immutable reviewed repository state. Do not edit runtime data manually during deployment.

## Smoke checks
Verify the active release loads, a team/player can be selected, price/currency state survives reload, Analysis renders, incomplete EV/ROI remains locked, pending releases cannot start analysis, offline/network failure is visible and retry recovers.

## Rollback
If a required smoke check fails, revert to the last known-good commit/deployment. Do not repair production data in-place. Re-run validation before redeploying.

## Incident rule
Data-integrity, release-scope, EV/ROI evidence-gate or mixed-version failures are launch-blocking. Prefer withholding a metric over displaying an unverified value.
