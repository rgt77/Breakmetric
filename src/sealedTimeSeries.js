// Time-series helpers for sealed-supply signals.
export function sortSignals(signals = []) {
  return [...signals].sort(
    (a,b) => new Date(a.observed_at) - new Date(b.observed_at)
  );
}

export function daysSinceRelease(releaseDate, asOfDate) {
  const start = new Date(releaseDate + "T00:00:00Z");
  const end = new Date(asOfDate + "T00:00:00Z");
  return Math.max(0, Math.floor((end - start) / 86400000));
}

export function lowerBoundOpenedUnits(signals = []) {
  return signals
    .filter(s => s.type === "BREAK_EVENT")
    .reduce((sum,s) => sum + Number(s.opened_units || 0), 0);
}
