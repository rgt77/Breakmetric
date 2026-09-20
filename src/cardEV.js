// BreakMetric single-card EV helpers

export function specificCardProbabilityPerPack(parallelDenominator, eligibleCards) {
  if (parallelDenominator <= 0 || eligibleCards <= 0) {
    throw new Error("Inputs must be positive");
  }
  return 1 / (parallelDenominator * eligibleCards);
}

export function expectedCopiesPerCase(parallelDenominator, eligibleCards, packsPerCase) {
  return packsPerCase * specificCardProbabilityPerPack(parallelDenominator, eligibleCards);
}

export function probabilityAtLeastOneSpecificCard(parallelDenominator, eligibleCards, packsPerCase) {
  const p = specificCardProbabilityPerPack(parallelDenominator, eligibleCards);
  return 1 - Math.pow(1 - p, packsPerCase);
}

export function singleCardEV(marketValue, parallelDenominator, eligibleCards, packsPerCase) {
  return marketValue * expectedCopiesPerCase(parallelDenominator, eligibleCards, packsPerCase);
}
