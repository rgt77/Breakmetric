// BreakMetric product-context helpers.
// A ready product must point to its own datasets so releases cannot silently share data.

export const requiredReadyProductDataKeys = [
  "product_data",
  "format_data",
  "ev_data",
  "base_checklist_data",
  "autograph_checklist_data",
  "player_index_data",
  "player_probability_data",
  "team_autograph_probability_data",
  "team_insert_probability_data",
  "team_base_parallel_probability_data",
  "live_supply_data",
  "sealed_supply_data",
  "production_estimate_data"
];

export function missingReadyProductData(product = {}) {
  if (product.status !== "ready") return [];
  return requiredReadyProductDataKeys.filter(key => !product[key]);
}

export function productIsAnalysisReady(product = {}) {
  return product.status === "ready" && missingReadyProductData(product).length === 0;
}

export function productDataPath(product = {}, key) {
  const value = product?.[key];
  return typeof value === "string" && value.length ? value : null;
}
