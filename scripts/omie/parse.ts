// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Reads the OMIE day-ahead price files for Portugal (marginalpdbcpt_AAAAMMDD.v)
 * and joins them into public/data/omie-pt.json. Format: docs/omie.md.
 */
import {
  HOUR,
  QUARTER_HOUR,
  startOfMadridDay,
  type EpochSeconds,
  type LocalDate,
} from '../../src/lib/time';
import { OMIE_SCHEMA_VERSION, omieFileSchema, type OmieFile } from '../../src/domain/omie';

/** The prices of one day: cents per MWh for each period, in order. */
export interface OmieDay {
  date: LocalDate;
  /** Seconds per period: 3600 until 30/09/2025, 900 since 01/10/2025. */
  step: number;
  prices: number[];
}

/** Periods in a day of 23, 24 or 25 hours, by length. */
const QUARTER_DAYS = new Set([92, 96, 100]);
const HOUR_DAYS = new Set([23, 24, 25]);

/** One file's text: "2026;10;26;1;228.59;228.59;" lines between "MARGINALPDBCPT;" and "*". */
export function parseOmieDay(text: string): OmieDay {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
  if (lines[0] !== 'MARGINALPDBCPT;' && lines[0] !== 'MARGINALPDBC;') {
    throw new Error(`Not an OMIE price file: ${lines[0] ?? '(empty)'}`);
  }
  let date: LocalDate | null = null;
  const prices: number[] = [];
  for (const line of lines.slice(1)) {
    if (line === '*') break;
    const [year, month, day, period, portugal] = line.split(';');
    const here = `${year}-${month?.padStart(2, '0')}-${day?.padStart(2, '0')}`;
    if (date === null) date = here;
    if (here !== date) throw new Error(`Two days in one file: ${date}, ${here}`);
    if (Number(period) !== prices.length + 1)
      throw new Error(`${date}: period ${period} out of order`);
    const value = Number(portugal);
    if (portugal === undefined || portugal === '' || !Number.isFinite(value)) {
      throw new Error(`${date}: no price in "${line}"`);
    }
    prices.push(Math.round(value * 100));
  }
  if (date === null) throw new Error('OMIE file without prices');
  const step = QUARTER_DAYS.has(prices.length)
    ? QUARTER_HOUR
    : HOUR_DAYS.has(prices.length)
      ? HOUR
      : null;
  if (step === null) throw new Error(`${date}: ${prices.length} periods`);
  return { date, step, prices };
}

/**
 * The days as one series of quarter hours from the first day's start (hourly
 * prices repeat in their four quarters); a missing day is a run of nulls.
 */
export function joinDays(
  days: readonly OmieDay[],
  meta: { source: string; fetchedAt: string },
): OmieFile {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0];
  if (!first) throw new Error('No OMIE days');
  const start: EpochSeconds = startOfMadridDay(first.date);
  const prices: (number | null)[] = [];
  for (const day of sorted) {
    const from = (startOfMadridDay(day.date) - start) / QUARTER_HOUR;
    while (prices.length < from) prices.push(null);
    if (prices.length > from) throw new Error(`${day.date} overlaps the day before`);
    const repeat = day.step / QUARTER_HOUR;
    for (const price of day.prices) for (let i = 0; i < repeat; i++) prices.push(price);
  }
  return omieFileSchema.parse({
    schemaVersion: OMIE_SCHEMA_VERSION,
    ...meta,
    start,
    prices,
  });
}
