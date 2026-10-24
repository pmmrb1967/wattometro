// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Backtest of the month bill forecast (src/ml/bill-forecast.ts) on the real
 * E-Redes export in fixtures/private (never committed), with the tariff of the
 * last invoice in fixtures/private/repsol-electricity-invoices.json.
 *
 *   pnpm ml:backtest --lat=40.21 --lon=-8.42
 *
 * The coordinates are the locality's (two decimals, as the app keeps them),
 * given here so they stay out of the repository. Prints only summary numbers:
 * record those in planning/plan.md, never the data.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { tariffInputSchema } from '../src/domain/tariff';
import { parseEredesXlsx } from '../src/import/eredes';
import {
  BACKTEST_DAYS,
  backtest,
  chooseForecast,
  prepareForecast,
  type Backtest,
} from '../src/ml/bill-forecast';
import { lisbonToday } from '../src/lib/time';
import {
  CLIMATE_YEARS,
  FORECAST_DAYS,
  climateNormal,
  dailyMeans,
  parseHourly,
} from '../src/weather/weather';

const PRIVATE = resolve('fixtures', 'private');
const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function dailyTemperature(latitude: string, longitude: string) {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCFullYear(start.getUTCFullYear() - CLIMATE_YEARS);
  const params = new URLSearchParams({
    latitude,
    longitude,
    start_date: start.toISOString().slice(0, 10),
    end_date: end.toISOString().slice(0, 10),
    hourly: 'temperature_2m',
    timeformat: 'unixtime',
  });
  const response = await fetch(`${ARCHIVE_URL}?${params}`);
  if (!response.ok) fail(`Open-Meteo: HTTP ${response.status}`);
  const hours = parseHourly(await response.json());
  if (!hours) fail('Open-Meteo: unexpected answer');
  return dailyMeans(hours);
}

const pct = (value: number | null) => (value === null ? '—' : `${value.toFixed(2)} %`);

function summary(label: string, result: Backtest) {
  console.log(`\n${label}: ${result.samples.length} forecasts (${result.unit})`);
  console.log(`  model ${pct(result.modelErrorPct)}   naive ${pct(result.naiveErrorPct)}`);
  for (const day of BACKTEST_DAYS) {
    const samples = result.samples.filter((sample) => sample.day === day);
    if (samples.length === 0) continue;
    const error = (pick: (s: (typeof samples)[number]) => number) =>
      (samples.reduce((sum, s) => sum + Math.abs(pick(s) - s.actual) / s.actual, 0) /
        samples.length) *
      100;
    console.log(
      `  day ${String(day).padStart(2)}: ${samples.length} months, model ${pct(error((s) => s.model))}, naive ${pct(error((s) => s.naive))}`,
    );
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { lat: { type: 'string' }, lon: { type: 'string' } } });
  if (!values.lat || !values.lon) fail('Usage: pnpm ml:backtest --lat=40.21 --lon=-8.42');

  const exportName = existsSync(PRIVATE)
    ? readdirSync(PRIVATE).find((name) => /^Consumos_.*\.xlsx$/.test(name))
    : undefined;
  if (!exportName) fail('No E-Redes export (Consumos_*.xlsx) in fixtures/private');
  const parsed = parseEredesXlsx(new Uint8Array(readFileSync(join(PRIVATE, exportName))));
  if (!parsed.ok) fail(`E-Redes export: ${parsed.error}`);

  const invoicesPath = join(PRIVATE, 'repsol-electricity-invoices.json');
  const invoices = existsSync(invoicesPath)
    ? (JSON.parse(readFileSync(invoicesPath, 'utf8')) as { invoices: { tariff: unknown }[] })
        .invoices
    : [];
  const tariff = invoices.length > 0 ? tariffInputSchema.parse(invoices.at(-1)?.tariff) : null;

  const daily = await dailyTemperature(values.lat, values.lon);
  const measured = (date: string) => daily.get(date) ?? null;
  const normal = climateNormal(daily);
  const data = prepareForecast(parsed.quarters, tariff);
  const month = lisbonToday().slice(0, 7);

  console.log(
    `${parsed.quarters.length} quarter hours; tariff: ${tariff ? tariff.option : 'none (Wh)'}`,
  );
  summary('With temperature', backtest(data, month, measured, normal));
  summary(
    `With temperature, the next ${FORECAST_DAYS} days as measured (a perfect weather forecast)`,
    backtest(data, month, measured, normal, FORECAST_DAYS),
  );
  summary(
    'Without temperature',
    backtest(
      data,
      month,
      () => null,
      () => null,
    ),
  );
  const today = lisbonToday();
  const temperatureOf = (date: string) => measured(date) ?? normal(date);
  const chosen = chooseForecast(data, month, today, temperatureOf, measured, normal);
  console.log(`
Method the app would choose for ${month}: ${chosen?.choice ?? 'none (too few days)'}`);
}

await main();
