# Phase 5 — architecture baseline

Phase 5 locks the current BreakMetric application into explicit boundaries before new product and valuation work continues.

## Runtime flow

`data/*.json → dataLoader → runtimeContracts/runtimeGuard → domain modules → coordinators → UI`

The browser UI must not become an alternate data-access or validation layer. Static runtime data is same-origin, fingerprint-versioned and validated before activation. EV, probability, market evidence and readiness are intentionally separate domain states.

## Boundaries

- **Data access:** `src/dataLoader.js` owns runtime JSON loading, path safety, bounded retries, cache versioning and stable-fingerprint batch activation.
- **Validation:** `src/runtimeContracts.js` and `src/runtimeGuard.js` reject malformed/incomplete runtime state before it reaches the application.
- **Domain:** analysis, EV coverage/provenance, market evidence and readiness modules own calculations and evidence semantics.
- **Application orchestration:** selection, market-record and FX coordinators own asynchronous transitions and prevent stale operations from winning races.
- **Persistence:** `src/storage.js` isolates browser persistence and fallback behavior.

The machine-readable contract is `data/validation/architecture-boundaries-v1.json`. CI executes `scripts/validate-architecture-boundaries.mjs` on every supported push and pull request.

## Phase-5 invariant

A future change that removes a required boundary module, bypasses same-origin data access, or drops the architecture contract from the runtime fails CI rather than silently weakening the application structure.
