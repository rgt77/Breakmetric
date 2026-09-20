// BreakMetric market-evidence audit engine.
// Pure functions so an audit snapshot can be regenerated from market-record v2 files.

export function auditMarketRecord(record = {}, sourceFile = null) {
  const sales = Array.isArray(record.sales) ? record.sales : [];
  const original = sales.filter(
    sale => sale.evidence_status === "original-marketplace-verified" &&
      sale.original_marketplace_verified === true
  ).length;
  const secondary = sales.filter(
    sale => sale.evidence_status === "secondary-source-realized-sale" &&
      sale.original_marketplace_verified === false
  ).length;
  const discoveryOnly = sales.filter(
    sale => sale.evidence_status === "discovery-only"
  ).length;

  return {
    source_file: sourceFile,
    schema_version: record.schema_version ?? null,
    product_id: record.product_id ?? null,
    player: record.player ?? null,
    team: record.team ?? null,
    card_number: record.card_number ?? null,
    set: record.set ?? null,
    parallel: record.parallel ?? null,
    sale_count: sales.length,
    original_marketplace_verified_sale_count: original,
    secondary_source_realized_sale_count: secondary,
    discovery_only_sale_count: discoveryOnly,
    evidence_status:
      sales.length && original === sales.length
        ? "original-marketplace-verified"
        : original > 0
          ? "mixed"
          : secondary > 0
            ? "secondary-source-only"
            : "discovery-only"
  };
}

export function auditTeamMarketRecords(records = []) {
  const entries = records.map(item =>
    auditMarketRecord(item.record, item.source_file)
  );

  const original = entries.reduce(
    (sum,item) => sum + item.original_marketplace_verified_sale_count, 0
  );
  const secondary = entries.reduce(
    (sum,item) => sum + item.secondary_source_realized_sale_count, 0
  );
  const discoveryOnly = entries.reduce(
    (sum,item) => sum + item.discovery_only_sale_count, 0
  );

  return {
    audited_card_contributions: entries.length,
    audited_sales: original + secondary + discoveryOnly,
    original_marketplace_verified_sales: original,
    secondary_source_realized_sales: secondary,
    discovery_only_sales: discoveryOnly,
    original_marketplace_verified_card_contributions:
      entries.filter(x => x.evidence_status === "original-marketplace-verified").length,
    secondary_source_card_contributions:
      entries.filter(x => x.evidence_status === "secondary-source-only").length,
    market_evidence_status:
      entries.length && entries.every(x => x.evidence_status === "original-marketplace-verified")
        ? "original-marketplace-verified"
        : original > 0
          ? "mixed"
          : secondary > 0
            ? "secondary-source-only"
            : "discovery-only",
    verified_ev_available: original > 0,
    provisional_ev_available: original + secondary > 0,
    entries
  };
}

export function auditMatchesContributions(auditEntries = [], contributions = []) {
  const sourceFiles = new Set(auditEntries.map(x => x.source_file));
  const contributionFiles = new Set(
    contributions.map(x => x.market_source_file).filter(Boolean)
  );

  return {
    valid:
      sourceFiles.size === contributionFiles.size &&
      [...contributionFiles].every(path => sourceFiles.has(path)),
    audited_source_count: sourceFiles.size,
    contribution_source_count: contributionFiles.size
  };
}
