// BreakMetric Serial Tracker
// Tracks uniquely observed serial-numbered copies without assuming that
// unobserved copies are still sealed.

export function normalizeSerial(serialNumber) {
  const value = String(serialNumber).trim().replace(/^0+/, "");
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("Invalid serial number");
  }
  return parsed;
}

export function uniqueObservedCopies(observations, printRun) {
  if (!Number.isInteger(printRun) || printRun <= 0) {
    throw new Error("printRun must be a positive integer");
  }

  const bySerial = new Map();

  for (const observation of observations || []) {
    const serial = normalizeSerial(observation.serial_number);

    if (serial > printRun) continue;

    if (!bySerial.has(serial)) {
      bySerial.set(serial, {
        serial_number: serial,
        first_observed_at: observation.observed_at ?? null,
        sources: []
      });
    }

    const copy = bySerial.get(serial);
    const sourceKey = [
      observation.marketplace ?? "",
      observation.source_sale_id ?? "",
      observation.source_url ?? ""
    ].join("|");

    if (!copy.sources.some(source => source.source_key === sourceKey)) {
      copy.sources.push({
        source_key: sourceKey,
        marketplace: observation.marketplace ?? null,
        source_sale_id: observation.source_sale_id ?? null,
        source_url: observation.source_url ?? null,
        observed_at: observation.observed_at ?? null
      });
    }
  }

  return [...bySerial.values()].sort(
    (a, b) => a.serial_number - b.serial_number
  );
}

export function serialTrackerMetrics(printRun, observations) {
  const observedCopies = uniqueObservedCopies(observations, printRun);
  const observedCount = observedCopies.length;

  return {
    print_run: printRun,
    confirmed_observed: observedCount,
    maximum_unobserved: Math.max(0, printRun - observedCount),
    observed_share: observedCount / printRun,
    observed_share_percent: (observedCount / printRun) * 100,
    observed_serial_numbers: observedCopies.map(copy => copy.serial_number),
    important_note:
      "Maximum unobserved is not the same as confirmed sealed remaining. Copies may have been opened without appearing in tracked public data."
  };
}
