// Helpers for turning market-sale serial labels into Serial Tracker observations.

export function parseSerialCopy(serialCopy) {
  if (!serialCopy) return null;
  const match = String(serialCopy).trim().match(/#?(\d+)\s*\/\s*(\d+)/);
  if (!match) return null;

  const serialNumber = Number(match[1]);
  const printRun = Number(match[2]);

  if (!Number.isInteger(serialNumber) || !Number.isInteger(printRun)) return null;
  if (serialNumber <= 0 || printRun <= 0 || serialNumber > printRun) return null;

  return { serial_number: serialNumber, print_run: printRun };
}

export function observationsFromSales(sales = []) {
  return sales.flatMap(sale => {
    const parsed = parseSerialCopy(sale.serial_copy);
    if (!parsed) return [];

    return [{
      ...parsed,
      observed_at: sale.sale_date ?? null,
      marketplace: sale.marketplace ?? null,
      source_sale_id: sale.source_sale_id ?? null,
      source_url: sale.source_reference ?? sale.source_url ?? null
    }];
  });
}
