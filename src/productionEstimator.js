// BreakMetric implied Hobby production estimator.
// Best used with Hobby-exclusive serial-numbered cards/parallels.

export function impliedPacksFromNumberedParallel({ printRun, packOddsDenominator }) {
  const n = Number(printRun);
  const d = Number(packOddsDenominator);
  if (!(n > 0) || !(d > 0)) throw new Error("printRun and denominator must be positive");
  return n * d;
}

export function productionSignal({
  name,
  printRun,
  packOddsDenominator,
  packsPerBox = 20,
  boxesPerCase = 12
}) {
  const impliedPacks = impliedPacksFromNumberedParallel({
    printRun,
    packOddsDenominator
  });

  return {
    name,
    print_run: printRun,
    pack_odds_denominator: packOddsDenominator,
    implied_hobby_packs: impliedPacks,
    implied_hobby_boxes: impliedPacks / packsPerBox,
    implied_hobby_cases: impliedPacks / packsPerBox / boxesPerCase
  };
}

export function median(values) {
  const sorted = [...values].sort((a,b)=>a-b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function aggregateProductionSignals(signals = []) {
  const packs = signals
    .map(s => Number(s.implied_hobby_packs))
    .filter(Number.isFinite);

  if (!packs.length) {
    return {
      status: "no-signals",
      signal_count: 0
    };
  }

  const low = Math.min(...packs);
  const high = Math.max(...packs);
  const med = median(packs);
  const spread = high - low;
  const spreadPctOfMedian = med ? spread / med : null;

  return {
    status: "implied-range",
    signal_count: packs.length,
    packs_low: low,
    packs_median: med,
    packs_high: high,
    spread_packs: spread,
    spread_percent_of_median: spreadPctOfMedian,
    consistency:
      spreadPctOfMedian <= 0.02 ? "high" :
      spreadPctOfMedian <= 0.05 ? "medium" :
      "low"
  };
}
