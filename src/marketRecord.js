// BreakMetric market record v2 helpers.

export function normalizeMarketSaleV2(sale = {}) {
  const direct = sale.direct_marketplace_url_recovered === true;
  const originalVerified =
    sale.original_marketplace_verified === true && direct;

  const evidenceStatus = originalVerified
    ? "original-marketplace-verified"
    : sale.discovery_source && sale.marketplace
      ? "secondary-source-realized-sale"
      : "discovery-only";

  const normalized = {
    ...sale,
    direct_marketplace_url_recovered: direct,
    evidence_status: evidenceStatus,
    original_marketplace_verified: originalVerified
  };

  delete normalized.verified_as_realized_sale;
  delete normalized.verified;

  return normalized;
}

export function summarizeMarketRecordEvidence(sales = []) {
  const original = sales.filter(
    sale => sale.evidence_status === "original-marketplace-verified"
  ).length;
  const secondary = sales.filter(
    sale => sale.evidence_status === "secondary-source-realized-sale"
  ).length;
  const discoveryOnly = sales.filter(
    sale => sale.evidence_status === "discovery-only"
  ).length;

  return {
    status:
      original === sales.length && sales.length
        ? "original-marketplace-verified"
        : original > 0
          ? "mixed"
          : secondary > 0
            ? "secondary-source-only"
            : "discovery-only",
    original_marketplace_verified_sale_count: original,
    secondary_source_realized_sale_count: secondary,
    discovery_only_sale_count: discoveryOnly
  };
}

export function validateMarketRecordV2(record = {}) {
  const errors = [];

  if (record.schema_version !== 2) errors.push("schema_version must be 2");
  if (!Array.isArray(record.sales)) errors.push("sales must be an array");

  for (const [index, sale] of (record.sales || []).entries()) {
    if ("verified_as_realized_sale" in sale) {
      errors.push("sale " + index + " contains legacy verified_as_realized_sale");
    }
    if ("verified" in sale) {
      errors.push("sale " + index + " contains legacy verified");
    }
    if (sale.original_marketplace_verified === true &&
        sale.direct_marketplace_url_recovered !== true) {
      errors.push("sale " + index + " claims original verification without recovered marketplace URL");
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
