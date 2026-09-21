# BreakMetric market-data methodology

## Goal
Estimate card market value as accurately as possible at 0 SEK/month while keeping source quality explicit.

## Evidence states
BreakMetric separates three useful states:

1. **Original-marketplace verified** — the stored record links to, or otherwise directly verifies, the original realized-sale source.
2. **Secondary-source realized sale** — an aggregator/discovery source reports a realized sale, but the original marketplace page is not recovered.
3. **Discovery only** — useful for research, but not sufficient to claim a realized sale as verified.

A legacy boolean such as `verified_as_realized_sale: true` does not by itself establish original-marketplace verification.

## Research workflow
1. Use 130 Point or another free discovery source to find candidate realized sales.
2. Recover and store the original marketplace sale when possible.
3. Supplement with direct eBay Sold/Completed and Fanatics Collect Sales History.
4. Store discovery source and original verification source separately.
5. Never use active asking prices as realized market value.

## Exact-match rules
A direct comparable must match:
- year/product
- player/subject
- set or insert set
- parallel/variation
- autograph status
- serial numbering where relevant
- grading state

Raw and graded cards are never mixed in one valuation sample.

## Deduplication
Deduplicate the same transaction using marketplace, source sale/listing ID where available, sale date, realized price, serial copy where available, and card identity.

## Market-value outputs
BreakMetric can expose two different values:

- **Verified market value** — median of original-marketplace-verified exact comparable sales.
- **Provisional market value** — median of exact comparable secondary-source realized-sale records when original verification is unavailable.

A provisional value must never be labeled simply “verified market value.”

## Confidence
For original-marketplace-verified exact comps:
- High: 10+ verified sales across at least 2 original sources.
- Medium: 4–9 verified sales.
- Low: 1–3 verified sales.
- None: 0 verified sales.

Secondary-source-only samples use **Provisional** confidence regardless of sale count. A large number of aggregator records increases sample size but does not convert the evidence into original-source verification.

## EV and ROI rules
Secondary-source data may contribute to an **indicative/provisional partial EV** when clearly labeled.
Final ROI requires both:
- complete EV coverage for the evaluated spot, and
- market evidence that meets the configured final-ROI source-verification gate.

## Sparse-data rule
If no exact comparable exists, BreakMetric must not silently invent a direct market value. Any neighbouring-parallel, serial-number, player or product estimate must be explicitly modeled as an estimate and kept separate.

## Cost
Market-data acquisition for the MVP: 0 SEK/month.


## Record freshness and sample quality
BreakMetric evaluates market-record robustness separately from source verification.

- **Fresh:** latest stored realized sale is 0–30 days old.
- **Current:** 31–90 days.
- **Aging:** 91–180 days.
- **Stale:** more than 180 days.
- **High sample size:** 10+ stored realized sales.
- **Medium:** 4–9.
- **Low:** 1–3.

A secondary-source record with 30 sales can therefore have high sample-size confidence while still remaining **provisional** from a source-verification perspective.

## Price-spread review
A min/max price spread of 4× or more is surfaced as a review flag. The flag does not silently delete sales, change the median, or upgrade/downgrade the source tier. Wide ranges can be legitimate for scarce cards, so any exclusion requires an explicit data correction or comp-quality decision.
