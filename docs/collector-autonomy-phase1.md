# Phase 1 — Autonomous continuous market collection

## Goal

BreakMetric must collect market data continuously without one development step per card. The collector must also distinguish **workflow execution** from **real collection health**.

## Baseline

The Phase-1 audit found both scheduled workflows active but no live provider collection:

- Fast lane run `35725003210`: `disabled-missing-credential`.
- Bulk lane run `35705708010`: `disabled-missing-csv-url`.
- Provider observations: 0.
- EV-eligible release slots: 8,896.
- Canonical valued slots: 33.

A green GitHub Actions run is therefore not treated as proof that market data is being collected.

## Autonomous runtime

The fast lane runs every 15 minutes. Work is selected with a persisted cursor over a deterministic team-then-subject round-robin queue. This prevents a missed schedule or restart from losing queue position and prevents one player or team from monopolizing collection.

Provider requests use deterministic exponential retry/backoff. Exact identity remains fail-closed. Observations with suspicious price ranges or extreme changes are quarantined instead of being promoted into the observation store.

The daily CSV lane uses a card-number index before identity matching. This avoids comparing every EV slot against every provider CSV row.

## Operational state

Operational files live under `ops/collector/`, outside the runtime `data/` tree:

- `state-v1.json` — lane state, cursor and health.
- `runs-v1.json` — bounded recent run journal.
- `metrics-v1.json` — cumulative counters and team/player distribution.
- `coverage-v1.json` — checked/exact/unknown coverage across the release.
- `exceptions-v1.json` — recurring misses, ambiguity, provider and identity failures.
- `price-history-v1.json` — first-seen values and actual provider price changes.
- `quarantine-v1.json` — observations rejected by quality gates.
- `soak-v1.json` — autonomous 24-hour soak state.
- `acceptance-v1.json` — machine-readable Phase-1 acceptance contract.

The operational monitor is available at `/collector-status.html`. It is not linked from the customer journey and is marked `noindex,nofollow`.

## Health

Health states are:

- `healthy` — fast lane is configured and live within its freshness threshold.
- `degraded` — collection is live but provider error rate or optional bulk freshness is poor.
- `stalled` — fast lane is unconfigured or has not completed a live run within 45 minutes.

An independent hourly watchdog runs the health check. If a previously configured fast lane becomes stale, the watchdog fails visibly.

## 24-hour acceptance

The first successful live fast-lane run automatically starts the soak clock. No manual start command is required.

Phase 1 passes only after:

- at least 24 elapsed hours,
- at least 72 successful live fast-lane runs,
- at least 500 distinct tasks checked,
- at least one exact provider price,
- provider error rate <= 15%,
- canonical EV contribution count unchanged during the soak.

When all criteria pass, `ops/collector/acceptance-v1.json` sets:

```json
{
  "status": "passed",
  "contract_id": "continuous-market-collection-v1"
}
```

Until a live `SPORTSCARDSPRO_TOKEN` exists, the correct state is `pending-live-provider`; the system must never claim a successful soak without real provider activity.

## Credentials

Live fast-lane collection requires the GitHub Actions repository secret `SPORTSCARDSPRO_TOKEN`.

The optional broad daily lane uses `SPORTSCARDSPRO_CSV_URL`.

No credential value or subscriber URL is written to repository data or operational telemetry.
