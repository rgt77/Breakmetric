# Phase 6 — canonical product model

BreakMetric identifies products by data identity, never by display text.

## Canonical identity

A product identity is the tuple:

`sport + manufacturer + product_family + competition + season + release_year`

`id` is the permanent internal key. `display_name`, `name` and aliases are presentation/search metadata and must never be used to join analysis datasets.

`season` and `release_year` are intentionally separate. A release may belong to season `2025/26` while physically releasing in calendar year `2026`.

## Format identity

A format is scoped to a product. Its effective identity is:

`product_id + "::" + format_id`

The same local format id (for example `hobby`) may exist on many products. Runtime contracts reject a format catalog when its `product_id` does not match the selected product.

## Lifecycle

Allowed lifecycle states are:

`pending → validated → analysis-ready → active`

The existing runtime `status` remains a compatibility field during migration. Only a product with `status: "ready"`, `active: true`, and `lifecycle_state: "active"` may be active.

## Collision protection

CI validates the committed catalog and synthetic near-collision fixtures. Two different IDs may not resolve to the same canonical product identity. Malformed/non-consecutive seasons and active-but-not-ready products fail closed.

This contract is deliberately sport-card generic. Premier League and Topps are current data, not architectural assumptions.
