// Opening-velocity model.
// Public break observations are convenience samples, so this module only
// returns a lower bound unless observation coverage is independently known.
export function observedOpeningLowerBound(events = []) {
  const valid = events.filter(e =>
    e.type === "BREAK_EVENT" &&
    Number(e.opened_units) > 0 &&
    e.observed_at
  );

  return {
    observed_event_count: valid.length,
    observed_opened_units_lower_bound: valid.reduce(
      (sum,e) => sum + Number(e.opened_units), 0
    ),
    representative_rate_available: false,
    note: "Observed public breaks are not assumed to represent the full market."
  };
}

export function estimateOpeningRate(events = [], coverageFraction) {
  if (!(coverageFraction > 0 && coverageFraction <= 1)) return null;
  const lower = observedOpeningLowerBound(events);
  return lower.observed_opened_units_lower_bound / coverageFraction;
}
