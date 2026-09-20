// BreakMetric sealed-supply estimator
// Produces a range rather than a false point estimate.

export function clampFraction(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(1, n));
}

export function normalizeEvidence(evidence = []) {
  return evidence
    .map(item => ({
      source: item.source ?? null,
      source_type: item.source_type ?? null,
      sealed_fraction_low: clampFraction(item.sealed_fraction_low),
      sealed_fraction_high: clampFraction(item.sealed_fraction_high),
      confidence_weight: Number(item.confidence_weight ?? 1),
      observed_at: item.observed_at ?? null,
      note: item.note ?? null
    }))
    .filter(item =>
      item.sealed_fraction_low !== null &&
      item.sealed_fraction_high !== null &&
      item.sealed_fraction_low <= item.sealed_fraction_high &&
      item.confidence_weight > 0
    );
}

export function estimateSealedSupply(evidence = []) {
  const rows = normalizeEvidence(evidence);

  if (!rows.length) {
    return {
      status: "no-evidence",
      sealed_fraction_low: null,
      sealed_fraction_mid: null,
      sealed_fraction_high: null,
      confidence: "none",
      evidence_count: 0
    };
  }

  const totalWeight = rows.reduce((sum, row) => sum + row.confidence_weight, 0);

  const low = rows.reduce(
    (sum, row) => sum + row.sealed_fraction_low * row.confidence_weight,
    0
  ) / totalWeight;

  const high = rows.reduce(
    (sum, row) => sum + row.sealed_fraction_high * row.confidence_weight,
    0
  ) / totalWeight;

  const mid = (low + high) / 2;

  let confidence = "low";
  if (rows.length >= 3 && totalWeight >= 6) confidence = "medium";
  if (rows.length >= 5 && totalWeight >= 12) confidence = "high";

  return {
    status: "estimated-range",
    sealed_fraction_low: low,
    sealed_fraction_mid: mid,
    sealed_fraction_high: high,
    confidence,
    evidence_count: rows.length,
    evidence: rows
  };
}
