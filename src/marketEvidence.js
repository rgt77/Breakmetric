// BreakMetric market-evidence classification.
// Discovery/aggregation evidence is intentionally kept separate from
// original-marketplace verification.

export const MARKET_EVIDENCE = Object.freeze({
  ORIGINAL_VERIFIED: "original-marketplace-verified",
  SECONDARY_REALIZED: "secondary-source-realized-sale",
  DISCOVERY_ONLY: "discovery-only",
  INVALID: "invalid"
});

function hostname(value) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function isOriginalMarketplaceUrl(sale = {}) {
  const url = sale.source_url || (
    sale.direct_marketplace_url_recovered ? sale.source_reference : null
  );
  const host = hostname(url);
  if (!host) return false;

  const marketplace = String(sale.marketplace || "").toLowerCase();

  if (marketplace.includes("ebay")) return host.includes("ebay.");
  if (marketplace.includes("fanatics")) return host.includes("fanatics");
  return Boolean(sale.direct_marketplace_url_recovered);
}

export function classifySaleEvidence(sale = {}) {
  const price = Number(sale.sale_price);
  if (!Number.isFinite(price) || price < 0 || !sale.sale_date) {
    return MARKET_EVIDENCE.INVALID;
  }

  if (isOriginalMarketplaceUrl(sale)) {
    return MARKET_EVIDENCE.ORIGINAL_VERIFIED;
  }

  if (
    sale.discovery_source &&
    sale.marketplace &&
    sale.discovery_source !== sale.marketplace
  ) {
    return MARKET_EVIDENCE.SECONDARY_REALIZED;
  }

  return MARKET_EVIDENCE.DISCOVERY_ONLY;
}

export function summarizeMarketEvidence(sales = []) {
  const counts = {
    [MARKET_EVIDENCE.ORIGINAL_VERIFIED]: 0,
    [MARKET_EVIDENCE.SECONDARY_REALIZED]: 0,
    [MARKET_EVIDENCE.DISCOVERY_ONLY]: 0,
    [MARKET_EVIDENCE.INVALID]: 0
  };

  for (const sale of sales) {
    counts[classifySaleEvidence(sale)] += 1;
  }

  const originalVerified = counts[MARKET_EVIDENCE.ORIGINAL_VERIFIED];
  const secondary = counts[MARKET_EVIDENCE.SECONDARY_REALIZED];

  return {
    counts,
    original_marketplace_verified_sale_count: originalVerified,
    secondary_source_realized_sale_count: secondary,
    verified_market_value_eligible: originalVerified > 0,
    provisional_market_value_eligible: originalVerified + secondary > 0,
    evidence_status:
      originalVerified > 0
        ? MARKET_EVIDENCE.ORIGINAL_VERIFIED
        : secondary > 0
          ? MARKET_EVIDENCE.SECONDARY_REALIZED
          : MARKET_EVIDENCE.DISCOVERY_ONLY
  };
}
