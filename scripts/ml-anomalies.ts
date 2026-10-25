// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The unusual days (src/ml/anomalies.ts) in the real E-Redes export in
 * fixtures/private (never committed), with the tariff of the last invoice in
 * fixtures/private/repsol-electricity-invoices.json.
 *
 *   pnpm ml:anomalies
 *
 * Without the temperature: the household's heating is not electric. Prints the
 * days to the terminal only; record just the counts in planning/plan.md.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tariffInputSchema } from '../src/domain/tariff';
import { parseEredesXlsx } from '../src/import/eredes';
import { formatCents } from '../src/lib/money';
import { formatKwh } from '../src/lib/units';
import { findAnomalies, LOOKBACK_DAYS, REFERENCE_DAYS } from '../src/ml/anomalies';
import { prepareForecast } from '../src/ml/bill-forecast';

const PRIVATE = resolve('fixtures', 'private');

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const exportName = existsSync(PRIVATE)
  ? readdirSync(PRIVATE).find((name) => /^Consumos_.*\.xlsx$/.test(name))
  : undefined;
if (!exportName) fail('No E-Redes export (Consumos_*.xlsx) in fixtures/private');
const parsed = parseEredesXlsx(new Uint8Array(readFileSync(join(PRIVATE, exportName))));
if (!parsed.ok) fail(`E-Redes export: ${parsed.error}`);

const invoicesPath = join(PRIVATE, 'repsol-electricity-invoices.json');
const invoices = existsSync(invoicesPath)
  ? (JSON.parse(readFileSync(invoicesPath, 'utf8')) as { invoices: { tariff: unknown }[] }).invoices
  : [];
const tariff = invoices.length > 0 ? tariffInputSchema.parse(invoices.at(-1)?.tariff) : null;

const data = prepareForecast(parsed.quarters, tariff);
const complete = [...data.days.values()].filter((day) => day.complete).length;
const found = findAnomalies(data, '0000-00-00');
const high = found.filter((anomaly) => anomaly.direction > 0);
console.log(
  `${complete} complete days; each judged against up to ${REFERENCE_DAYS} earlier days of its kind (${LOOKBACK_DAYS / 7} weeks back at most).`,
);
console.log(`Unusual: ${found.length} (${high.length} above, ${found.length - high.length} below)`);
for (const anomaly of found) {
  const pct = Math.round(((anomaly.actualWh - anomaly.expectedWh) * 100) / anomaly.expectedWh);
  const span = anomaly.span ? ` ${anomaly.span.from}–${anomaly.span.to} h` : '';
  const cost = anomaly.excessCents === null ? '' : ` ${formatCents(anomaly.excessCents)}`;
  console.log(
    `  ${anomaly.date} ${anomaly.kind.padEnd(8)} ${formatKwh(anomaly.actualWh)} vs ${formatKwh(anomaly.expectedWh)} (${pct > 0 ? '+' : ''}${pct} %, z ${anomaly.zTenths / 10})${span}${cost}`,
  );
}
