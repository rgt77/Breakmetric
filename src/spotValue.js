// BreakMetric spot-value helpers

export function calculateSpotMetrics({ spotPrice, expectedValue }) {
  const price = Number(spotPrice);
  const ev = Number(expectedValue);

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("spotPrice must be a positive number");
  }
  if (!Number.isFinite(ev) || ev < 0) {
    throw new Error("expectedValue must be zero or greater");
  }

  return {
    spot_price: price,
    expected_value: ev,
    expected_net: ev - price,
    value_ratio: ev / price,
    expected_roi: (ev - price) / price,
    expected_roi_percent: ((ev - price) / price) * 100
  };
}
