# Player probability coverage

BreakMetric separates a probability result from the amount of checklist information that supports it.

## Checklist-entry modeling coverage

Coverage answers:

> How many of this player's physical Hobby checklist entries are connected to at least one published Hobby odds row?

It does **not** claim that every possible parallel or variation for that card has published odds.

Coverage states:
- **Complete** — every relevant stored checklist entry has at least one usable Hobby odds mapping.
- **Partial** — some entries are modeled and some are not.
- **None** — no relevant stored entry has usable Hobby odds.

## Category coverage

Coverage is stored separately for:
- base
- inserts
- autographs

This makes it possible to see exactly where a probability estimate is incomplete.

## Pooled autograph correction

The Cold Battle autograph odds are published as a shared Hobby odds row. Its single- and dual-autograph checklist sections are therefore treated as one shared physical pool rather than as separate odds events.

## Why this matters

A player may have a strong-looking probability based on modeled sections while also appearing in an unmapped section. BreakMetric now exposes that limitation instead of silently treating the modeled probability as complete.
