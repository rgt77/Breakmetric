// BreakMetric Live Odds confidence labels.
// These describe evidence quality, not certainty that unobserved cards remain sealed.

export function liveOddsConfidence({
  serialObservedCount,
  serialSourceCount,
  sealedFractionSource
}) {
  if (!sealedFractionSource || sealedFractionSource === "scenario") {
    return {
      level: "scenario-only",
      reason: "No independently verified estimate of remaining sealed product."
    };
  }

  if (serialObservedCount >= 10 && serialSourceCount >= 2) {
    return { level: "medium", reason: "Multiple observed serials and sources plus an external sealed-supply estimate." };
  }

  if (serialObservedCount >= 1) {
    return { level: "low", reason: "Observed serials exist, but public observation coverage is incomplete." };
  }

  return { level: "very-low", reason: "No observed serial evidence for this card." };
}
