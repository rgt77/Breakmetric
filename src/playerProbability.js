// BreakMetric player probability helpers.
export function expectedHitsFromPackOdds(packsPerCase, denominator, checklistShare) {
  if (!(packsPerCase > 0) || !(denominator > 0) || !(checklistShare >= 0)) return 0;
  return (packsPerCase / denominator) * checklistShare;
}

export function chanceAtLeastOneFromPackOdds(packsPerCase, denominator, checklistShare) {
  if (!(packsPerCase > 0) || !(denominator > 0) || !(checklistShare >= 0)) return 0;
  const p = (1 / denominator) * checklistShare;
  return 1 - Math.pow(1 - p, packsPerCase);
}

export function expectedHitsFromBoxQuantity(boxesPerCase, quantityPerBox, checklistShare) {
  if (!(boxesPerCase > 0) || !(quantityPerBox >= 0) || !(checklistShare >= 0)) return 0;
  return boxesPerCase * quantityPerBox * checklistShare;
}

export function chanceAtLeastOneFromDraws(draws, checklistShare) {
  if (!(draws >= 0) || !(checklistShare >= 0 && checklistShare <= 1)) return 0;
  return 1 - Math.pow(1 - checklistShare, draws);
}

export function combineIndependentNoHitProbabilities(noHitProbabilities = []) {
  return 1 - noHitProbabilities.reduce((product, value) => product * value, 1);
}
