// SPDX-License-Identifier: AGPL-3.0-or-later
// Real data (fixtures/private, local only): the E-Redes export and invoices of the same home.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseEredesXlsx } from '../import/eredes';
import { lisbonToday, nextDate, startOfLisbonDay } from '../lib/time';
import { annualUsage, compareOffers } from './compare';
import { electricityCost } from './electricity-cost';
import { offersFileSchema } from './erse';
import { tariffInputSchema } from './tariff';

const PRIVATE = join(__dirname, '..', '..', 'fixtures', 'private');
const exportName = existsSync(PRIVATE)
  ? readdirSync(PRIVATE).find((name) => /^Consumos_.*\.xlsx$/.test(name))
  : undefined;
const invoicesPath = join(PRIVATE, 'repsol-electricity-invoices.json');
const hasData = exportName !== undefined && existsSync(invoicesPath);

interface RealInvoice {
  file: string;
  period: string;
  days: number;
  tariff: unknown;
  invoice: { totalCents: number };
}

// The describe body runs even when skipped: read the private files only if they exist.
function load() {
  const parsed = parseEredesXlsx(new Uint8Array(readFileSync(join(PRIVATE, exportName ?? ''))));
  if (!parsed.ok) throw new Error(parsed.error);
  const invoices = (JSON.parse(readFileSync(invoicesPath, 'utf8')) as { invoices: RealInvoice[] })
    .invoices;
  return { parsed, invoices };
}

describe.skipIf(!hasData)('E-Redes export against invoices', () => {
  const { parsed, invoices } = hasData
    ? load()
    : { parsed: { quarters: [] }, invoices: [] as RealInvoice[] };

  it.each(invoices)('$file: the quarter hours of its period give its total (±1 %)', (invoice) => {
    const [first = '', last = ''] = invoice.period.split('..');
    const from = startOfLisbonDay(first);
    const to = startOfLisbonDay(nextDate(last));
    const energyWh = parsed.quarters
      .filter((quarter) => quarter.ts >= from && quarter.ts < to)
      .reduce((sum, quarter) => sum + quarter.energyWh, 0);
    const tariff = tariffInputSchema.parse(invoice.tariff);
    const cost = electricityCost({ simple: energyWh }, invoice.days, tariff);
    expect(Math.abs(cost.totalCents - invoice.invoice.totalCents)).toBeLessThanOrEqual(
      invoice.invoice.totalCents / 100,
    );
  });

  it('ranks the real ERSE offers for the real year', () => {
    const offers = offersFileSchema.parse(
      JSON.parse(readFileSync(join(__dirname, '../../public/data/erse-offers.json'), 'utf8')),
    ).offers;
    const current = tariffInputSchema.parse(invoices.at(-1)?.tariff);
    const usage = annualUsage(parsed.quarters, current.periodsMap);
    expect(usage?.extrapolated).toBe(false);
    const comparison = compareOffers({ usage: usage!, current, offers, today: lisbonToday() });
    expect(comparison.results.length).toBeGreaterThan(100);
    expect(comparison.currentCents).toBeGreaterThan(0);
  });
});
