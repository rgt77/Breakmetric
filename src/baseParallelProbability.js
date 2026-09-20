// BreakMetric base-parallel probability helpers

export function teamChecklistShare(teamCards, totalCards = 200) {
  if (teamCards < 0 || totalCards <= 0) throw new Error("Invalid checklist counts");
  return teamCards / totalCards;
}

export function expectedPackOddsHits(denominator, packCount, teamShare = 1) {
  return packCount * (1 / denominator) * teamShare;
}

export function probabilityAtLeastOneTeamHit(denominator, packCount, teamShare = 1) {
  const p = (1 / denominator) * teamShare;
  return 1 - Math.pow(1 - p, packCount);
}

export function probabilityFromChecklistDraws(teamShare, drawCount) {
  return 1 - Math.pow(1 - teamShare, drawCount);
}
