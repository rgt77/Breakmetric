// BreakMetric team market-evidence registry helpers.

export function registryEntryForTeam(registry = {}, team) {
  return registry?.teams?.[team] || null;
}

export function registryTeamStatus(registry = {}, team) {
  const entry = registryEntryForTeam(registry, team);
  if (!entry) {
    return {
      status: "missing",
      audited: false,
      roi_eligible: false
    };
  }

  return {
    status: entry.status || "unknown",
    audited: entry.status !== "not-audited",
    roi_eligible: entry.roi_eligible === true,
    market_evidence_status: entry.market_evidence_status || "none",
    audited_contribution_count: Number(entry.audited_contribution_count || 0),
    original_marketplace_verified_contribution_count:
      Number(entry.original_marketplace_verified_contribution_count || 0)
  };
}

export function registrySnapshotMatchesEv(entry = {}, teamEv = {}) {
  const registryKeys = [...(entry.contribution_keys || [])].sort();
  const evKeys = (teamEv.contributions || [])
    .map(item => item.card_id + "|" + item.market_source_file)
    .sort();

  return (
    registryKeys.length === evKeys.length &&
    registryKeys.every((key, index) => key === evKeys[index]) &&
    Number(entry.audited_contribution_count || 0) === evKeys.length
  );
}
