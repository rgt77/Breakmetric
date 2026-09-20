// BreakMetric sealed-supply evidence taxonomy
export const SEALED_EVIDENCE_TYPES = {
  MANUFACTURER_STOCK_STATUS: {
    quantitative: false,
    meaning: "Shows manufacturer availability, not remaining market-wide sealed percentage."
  },
  SEALED_SECONDARY_SALE: {
    quantitative: false,
    meaning: "Proves sealed product still trades publicly, but not how much remains."
  },
  BREAK_EVENT: {
    quantitative: false,
    meaning: "Confirms at least one case/box was opened at a known time."
  },
  VERIFIED_INVENTORY_COUNT: {
    quantitative: true,
    meaning: "A dated, countable sealed inventory observation."
  },
  VERIFIED_PRODUCTION_TOTAL: {
    quantitative: true,
    meaning: "A sourced production total usable as a denominator."
  },
  SERIAL_OBSERVATION: {
    quantitative: true,
    meaning: "A uniquely observed numbered card; lower bound on copies opened."
  }
};

export function canEstimateSealedFraction(evidence = []) {
  const hasProductionTotal = evidence.some(
    e => e.type === "VERIFIED_PRODUCTION_TOTAL" && Number(e.value) > 0
  );
  const hasInventoryCount = evidence.some(
    e => e.type === "VERIFIED_INVENTORY_COUNT" && Number(e.value) >= 0
  );
  return hasProductionTotal && hasInventoryCount;
}
