# BreakMetric automated market collection

## Goal

The market layer must scale from one researched card to whole releases and, eventually, many releases per year. A new card should normally require data, not a new code change.

## Runtime model

1. Expand every EV-eligible card × variant slot from normalized checklist and odds data.
2. Remove slots already represented by canonical EV provenance.
3. Order remaining work with player breadth before depth.
4. Collect exact-provider current prices in rotating batches every 15 minutes.
5. Import a full provider CSV once per day when available.
6. Persist only changed observations.
7. Generate valuation candidates without mutating canonical realized-sale EV.

## Evidence hierarchy

- **A — exact realized sales:** existing canonical market-record path.
- **B — exact provider current price:** direct current ungraded provider value; candidate EV only.
- **C — subject/category model:** median of direct observations for the same subject/category.
- **D — team/product category model:** fallback median when subject evidence is absent.
- **E — unknown:** insufficient evidence.

Only A is currently eligible for the existing canonical EV path. B is intentionally separated so BreakMetric can gain broad market coverage without misrepresenting a provider's current price as a completed sale. C and D are explicitly modeled values.

## Identity safety

Collection is fail-closed. The matcher requires the target year and product-family tokens, subject, card number, parallel and non-base set when applicable. Known cross-series contamination such as Sapphire is rejected.

## Scheduling

The fast workflow is scheduled every 15 minutes. It uses rotating deterministic shards, so the same batch is not polled continuously. The API adapter enforces at least 1100 ms between requests.

The daily workflow uses the subscriber CSV path. It is intended for broad coverage because the provider documents CSV as the efficient mechanism for thousands of items.

## Credentials

Live provider collection requires repository secrets:

- `SPORTSCARDSPRO_TOKEN`
- `SPORTSCARDSPRO_CSV_URL` (optional but recommended for bulk coverage)

The repository contains no provider token or private download URL.

## Failure behavior

Missing credentials, provider errors, ambiguous matches and identity mismatches never create canonical values. Existing observations and canonical EV remain untouched. Scheduled runs commit only when persisted market data changes.
