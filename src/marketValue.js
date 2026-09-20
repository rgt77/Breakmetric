// BreakMetric market-value engine
// Uses realized sale prices, not asking prices.

export function median(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function mean(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function confidenceFromSalesCount(count) {
  if (count >= 10) return "high";
  if (count >= 4) return "medium";
  if (count >= 1) return "low";
  return "none";
}

export function calculateMarketValue(sales) {
  const validSales = sales
    .map(sale => Number(sale.sale_price))
    .filter(value => Number.isFinite(value) && value >= 0);

  return {
    sale_count: validSales.length,
    median_price: median(validSales),
    mean_price: mean(validSales),
    min_price: validSales.length ? Math.min(...validSales) : null,
    max_price: validSales.length ? Math.max(...validSales) : null,
    confidence: confidenceFromSalesCount(validSales.length)
  };
}


// Evidence-aware confidence. Sales-count confidence alone must never promote
// secondary-source-only data to verified/high-confidence market value.
export function evidenceAwareConfidence({
  original_verified_sale_count = 0,
  secondary_realized_sale_count = 0,
  original_source_count = 0
} = {}) {
  if (original_verified_sale_count >= 10 && original_source_count >= 2) {
    return "high";
  }
  if (original_verified_sale_count >= 4) {
    return "medium";
  }
  if (original_verified_sale_count >= 1) {
    return "low";
  }
  if (secondary_realized_sale_count >= 1) {
    return "provisional";
  }
  return "none";
}

export function marketValueStatus({
  original_verified_sale_count = 0,
  secondary_realized_sale_count = 0
} = {}) {
  if (original_verified_sale_count > 0) return "verified";
  if (secondary_realized_sale_count > 0) return "provisional-secondary-source";
  return "unavailable";
}
