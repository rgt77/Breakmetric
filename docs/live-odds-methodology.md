# BreakMetric Live Odds methodology

## Purpose
BreakMetric Live Odds adds observed serial-number data to manufacturer odds without pretending that public market data is a complete census of opened cards.

## Core distinction
A card that has been observed in public is confirmed opened.
A card that has not been observed is **not** confirmed sealed.

Therefore:
- observed serials are a lower bound on copies opened;
- print run minus observed serials is only a maximum possible number still unobserved;
- a separate estimate of the amount of sealed product remaining is required before odds can be adjusted.

## Conservative depletion model
For a serial-numbered card with print run N:

- K = uniquely observed serials
- s = independently estimated sealed fraction of the product
- original p = manufacturer-derived probability for the specific card per pack
- neutral expected remaining copies = N × s
- confirmed maximum unobserved copies = N − K

BreakMetric depletion factor:

factor = min(1, (N − K) / (N × s))

Adjusted probability:

live p = original p × factor

This model never increases the manufacturer's original probability. It only lowers it when confirmed pulls are already greater than the opened share implied by the sealed-product estimate.

## Why this matters
Simply seeing 10/50 copies on the market does not automatically mean the chance in a remaining sealed case is 20% lower. If roughly 20% of the product has also been opened, that pull count is consistent with the original odds.

The useful signal appears when observed depletion is unusually high relative to an independent estimate of how much product has been opened.

## Confidence
Until BreakMetric has a sourced sealed-product estimate, Live Odds are shown as scenario analysis only.

## Duplicate control
A physical serial number counts once even if it is sold repeatedly or appears on multiple marketplaces.

## Current tracked example
Estêvão Willian Gold Refractor Autograph #CA-EV is /50. Serial copies 14/50 and 34/50 have been observed in realized sales. That means at least 2 copies are confirmed opened, but it does not prove that the other 48 are sealed.
