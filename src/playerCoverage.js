// BreakMetric player probability coverage helpers.

export function checklistEntryCoverage({ total = 0, modeled = 0 } = {}) {
  const t = Number(total);
  const m = Number(modeled);

  if (!(t > 0)) {
    return { total: 0, modeled: 0, percent: 0, status: "none" };
  }

  const safeModeled = Math.max(0, Math.min(t, m));
  return {
    total: t,
    modeled: safeModeled,
    percent: (safeModeled / t) * 100,
    status: safeModeled === t ? "complete" : safeModeled > 0 ? "partial" : "none"
  };
}

export function uniqueChecklistEntryKey(entry = {}) {
  return [entry.category || "", entry.section || "", entry.card_number || ""].join("|||");
}

export function unmappedSections(entries = [], modeledKeys = new Set()) {
  return [...new Set(
    entries
      .filter(entry => !modeledKeys.has(uniqueChecklistEntryKey(entry)))
      .map(entry => entry.section)
      .filter(Boolean)
  )].sort();
}
