// Evidence gate for activating BreakMetric Live Odds.
export function liveOddsGate({
  sealedFractionLow,
  sealedFractionHigh,
  independentQuantitativeSourceTypes = 0,
  serialObservedCount = 0
}) {
  const rangeValid =
    Number.isFinite(Number(sealedFractionLow)) &&
    Number.isFinite(Number(sealedFractionHigh)) &&
    sealedFractionLow >= 0 &&
    sealedFractionHigh <= 1 &&
    sealedFractionLow <= sealedFractionHigh;

  const enoughIndependentEvidence = independentQuantitativeSourceTypes >= 2;
  const hasSerialEvidence = serialObservedCount > 0;

  const active = rangeValid && enoughIndependentEvidence && hasSerialEvidence;

  return {
    active,
    status: active ? "active" : "scenario-only",
    requirements: {
      valid_sealed_fraction_range: rangeValid,
      at_least_two_independent_quantitative_source_types: enoughIndependentEvidence,
      serial_observation_present: hasSerialEvidence
    }
  };
}
