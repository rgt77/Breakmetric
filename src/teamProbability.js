import { probabilityAtLeastOne } from "./probability.js";

// Calculates the probability for a specific team within a parallel checklist.
// Assumption: every eligible card in the parallel checklist is equally likely.
export function teamParallelProbabilities({
  parallelDenominator,
  teamEligibleCards,
  totalEligibleCards,
  packsPerBox = 20,
  boxesPerCase = 12
}) {
  if (teamEligibleCards <= 0 || totalEligibleCards <= 0) {
    throw new Error("Checklist counts must be positive.");
  }

  const teamShare = teamEligibleCards / totalEligibleCards;
  const probabilityPerPack = (1 / parallelDenominator) * teamShare;
  const packsPerCase = packsPerBox * boxesPerCase;

  return {
    team_share: teamShare,
    probability_per_pack: probabilityPerPack,
    probability_per_box: 1 - Math.pow(1 - probabilityPerPack, packsPerBox),
    probability_per_case: 1 - Math.pow(1 - probabilityPerPack, packsPerCase)
  };
}
