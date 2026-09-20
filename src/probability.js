// BreakMetric probability engine
// Converts manufacturer odds such as 1:221 packs into hit probabilities.

export function probabilityAtLeastOne(denominator, trials) {
  if (!Number.isFinite(denominator) || denominator <= 0) {
    throw new Error("denominator must be a positive number");
  }
  if (!Number.isInteger(trials) || trials < 0) {
    throw new Error("trials must be a non-negative integer");
  }

  const pPerTrial = 1 / denominator;
  return 1 - Math.pow(1 - pPerTrial, trials);
}

export function packOddsToBreakProbabilities(
  denominator,
  packsPerBox = 20,
  boxesPerCase = 12
) {
  const packsPerCase = packsPerBox * boxesPerCase;

  return {
    denominator,
    probability_per_pack: 1 / denominator,
    probability_per_box: probabilityAtLeastOne(denominator, packsPerBox),
    probability_per_case: probabilityAtLeastOne(denominator, packsPerCase),
    packs_per_box: packsPerBox,
    boxes_per_case: boxesPerCase,
    packs_per_case: packsPerCase
  };
}

export function toPercent(probability, decimals = 2) {
  return Number((probability * 100).toFixed(decimals));
}
