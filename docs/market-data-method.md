# BreakMetric market-data methodology

## Goal
Use the most accurate market-value method available at 0 SEK/month.

## Primary free research workflow
1. Use 130 Point to discover comparable realized sales across multiple marketplaces.
2. Verify the original marketplace sale when a direct source page is available.
3. Supplement with direct eBay Sold/Completed Listings and Fanatics Collect Sales History.
4. Store only realized sale prices. Never use active asking prices as market value.

## Supported free sources
- 130 Point — discovery/aggregation across multiple marketplaces.
- eBay — sold/completed listings.
- Fanatics Collect — sales history.
- Other original marketplaces surfaced through 130 Point when the sold result can be verified.

## Matching rules
A sale is considered a direct comparable only when these fields match:
- year/product
- player/subject
- set or insert set
- parallel/variation
- autograph status
- serial numbering where relevant
- grading state

Raw and graded cards must never be mixed in the same valuation sample.

## Deduplication
The same transaction may appear in more than one source.
BreakMetric must deduplicate sales using:
- marketplace
- source sale/listing ID when available
- sale date
- realized price
- card identity

## Market-value calculation
Primary market value = median of verified comparable realized sales.

Also store:
- number of comps
- mean
- minimum and maximum
- date of most recent comp
- source count
- confidence level

## Confidence
- High: 10+ direct comparable verified sales from at least 2 sources
- Medium: 4–9 direct comparable verified sales, or sales from only 1 source
- Low: 1–3 direct comparable verified sales
- None: no direct comparable sale

## Sparse-data rule
If no exact comparable exists, BreakMetric must not silently invent a value.
Any estimate based on a neighbouring parallel, serial number, player or product must be marked as an estimate and kept separate from direct-comparable market value.

## Cost
Market-data acquisition for the MVP: 0 SEK/month.
