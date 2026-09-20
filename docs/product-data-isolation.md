# Product data isolation

BreakMetric treats each release as a separate product context.

The product catalog is the routing layer. A product marked `ready` must provide its own paths for product metadata, box formats, checklists, player data, team probabilities, EV, Live Odds, sealed-supply signals and production estimates.

The browser UI must never derive another release's file paths by changing a year in a filename. It only loads the explicit paths stored on the selected product.

Pending products can appear in navigation, but their analysis stays disabled until their own dataset manifest is complete.

Team options are loaded from the selected product's metadata rather than being hardcoded into the page. This allows future products to use different leagues, teams and checklist structures without inheriting Premier League data.

On product change, release-specific state is cleared before the new product is loaded. This prevents stale team, player, EV, probability and supply data from the previous release from remaining visible.
