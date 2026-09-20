// BreakMetric insert probability helpers

export function probabilityAtLeastOneFromIndependentDraws(probabilityPerDraw, draws) {
  return 1 - Math.pow(1 - probabilityPerDraw, draws);
}

export function teamShare(teamCards, checklistCards) {
  if (checklistCards <= 0) throw new Error("checklistCards must be positive");
  return teamCards / checklistCards;
}

export function packOddsTeamProbability(denominator, share, packCount) {
  const probabilityPerPack = (1 / denominator) * share;
  return probabilityAtLeastOneFromIndependentDraws(probabilityPerPack, packCount);
}
