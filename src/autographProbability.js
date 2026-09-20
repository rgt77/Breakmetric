// BreakMetric autograph probability model
// Uses manufacturer autograph odds as relative frequencies in the Hobby autograph pool.

export function chanceAtLeastOne(probabilityPerAutograph, autographCount) {
  return 1 - Math.pow(1 - probabilityPerAutograph, autographCount);
}

export function teamAutographCaseMetrics(teamRatePerPack, totalAutographRatePerPack, boxesPerCase = 12) {
  if (teamRatePerPack < 0 || totalAutographRatePerPack <= 0) {
    throw new Error("Invalid autograph rates.");
  }
  const probabilityPerAutograph = teamRatePerPack / totalAutographRatePerPack;

  return {
    probability_per_autograph: probabilityPerAutograph,
    expected_autographs_per_case: boxesPerCase * probabilityPerAutograph,
    probability_at_least_one_in_case: chanceAtLeastOne(probabilityPerAutograph, boxesPerCase)
  };
}
