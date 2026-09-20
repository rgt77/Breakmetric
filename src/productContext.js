// BreakMetric product-context helpers.
// Product context is release-scoped. Format-specific analysis paths live only in the format catalog.

export const requiredReadyProductDataKeys = [
  "product_data",
  "integrity_data",
  "format_data"
];

export function missingReadyProductData(product = {}) {
  if (product.status !== "ready") return [];
  return requiredReadyProductDataKeys.filter(key => !product[key]);
}

export function productIsReady(product = {}) {
  return product.status === "ready" &&
    missingReadyProductData(product).length === 0;
}

// Backward-compatible alias while older code/tests are phased out.
export const productIsAnalysisReady = productIsReady;

export function productDataPath(product = {}, key) {
  const value = product?.[key];
  return typeof value === "string" && value.length ? value : null;
}
