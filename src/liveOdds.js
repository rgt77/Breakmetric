// BreakMetric Live Odds engine
// Conservative depletion model. Observed serials are a lower bound on copies
// already opened; they do not by themselves prove how much sealed product remains.

export function impliedInitialPackPopulation(printRun, originalSpecificCardProbabilityPerPack) {
  if (!(printRun > 0) || !(originalSpecificCardProbabilityPerPack > 0)) {
    throw new Error("printRun and probability must be positive");
  }
  return printRun / originalSpecificCardProbabilityPerPack;
}

export function confirmedRemainingMaximum(printRun, confirmedObserved) {
  return Math.max(0, printRun - confirmedObserved);
}

export function neutralExpectedRemaining(printRun, sealedFraction) {
  if (!(sealedFraction > 0 && sealedFraction <= 1)) {
    throw new Error("sealedFraction must be > 0 and <= 1");
  }
  return printRun * sealedFraction;
}

// Never increases the manufacturer's original probability.
// It only reduces it when confirmed pulls exceed what the assumed opened share
// would imply under a neutral/random-opening model.
export function conservativeDepletionFactor({ printRun, confirmedObserved, sealedFraction }) {
  const maxRemaining = confirmedRemainingMaximum(printRun, confirmedObserved);
  const neutralRemaining = neutralExpectedRemaining(printRun, sealedFraction);
  return Math.max(0, Math.min(1, maxRemaining / neutralRemaining));
}

export function adjustedSpecificCardProbabilityPerPack({
  originalProbabilityPerPack,
  printRun,
  confirmedObserved,
  sealedFraction
}) {
  return originalProbabilityPerPack * conservativeDepletionFactor({
    printRun,
    confirmedObserved,
    sealedFraction
  });
}

export function chanceAtLeastOne(probabilityPerPack, packCount) {
  return 1 - Math.pow(1 - probabilityPerPack, packCount);
}

export function liveOddsScenario({
  originalProbabilityPerPack,
  printRun,
  confirmedObserved,
  sealedFraction,
  packsPerCase,
  marketValue
}) {
  const factor = conservativeDepletionFactor({
    printRun,
    confirmedObserved,
    sealedFraction
  });

  const adjustedPerPack = originalProbabilityPerPack * factor;
  const initialPacks = impliedInitialPackPopulation(printRun, originalProbabilityPerPack);
  const estimatedSealedPacks = initialPacks * sealedFraction;
  const maxRemaining = confirmedRemainingMaximum(printRun, confirmedObserved);
  const neutralRemaining = neutralExpectedRemaining(printRun, sealedFraction);

  const expectedCopiesPerCase = adjustedPerPack * packsPerCase;
  const caseProbability = chanceAtLeastOne(adjustedPerPack, packsPerCase);

  return {
    sealed_fraction: sealedFraction,
    manufacturer_probability_per_pack: originalProbabilityPerPack,
    depletion_factor: factor,
    adjusted_probability_per_pack: adjustedPerPack,
    manufacturer_case_probability: chanceAtLeastOne(originalProbabilityPerPack, packsPerCase),
    adjusted_case_probability: caseProbability,
    implied_initial_pack_population: initialPacks,
    estimated_sealed_pack_population: estimatedSealedPacks,
    confirmed_remaining_maximum: maxRemaining,
    neutral_expected_remaining: neutralRemaining,
    expected_copies_per_case: expectedCopiesPerCase,
    live_ev: Number.isFinite(Number(marketValue))
      ? Number(marketValue) * expectedCopiesPerCase
      : null
  };
}

export function depletionTriggerSealedFraction(printRun, confirmedObserved) {
  if (!(printRun > 0)) throw new Error("printRun must be positive");
  return confirmedRemainingMaximum(printRun, confirmedObserved) / printRun;
}
