// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Day-ahead prices of the Portuguese zone of the Iberian market (OMIE), one per
 * quarter hour, from public/data/omie-pt.json (pnpm omie:sync, docs/omie.md),
 * and tomorrow's, which the Worker reads every day (server/src/omie.ts).
 */
import { z } from 'zod';
import { HOUR, QUARTER_HOUR, type EpochSeconds, type LocalDate } from '../lib/time';

/** Format of omie-pt.json; part of its URL so a cached older file is never used. */
export const OMIE_SCHEMA_VERSION = 1;
export const OMIE_URL = `/data/omie-pt.json?v=${OMIE_SCHEMA_VERSION}`;

export const omieFileSchema = z.object({
  schemaVersion: z.literal(OMIE_SCHEMA_VERSION),
  /** The last file read, e.g. "marginalpdbcpt_20261026.1". */
  source: z.string(),
  fetchedAt: z.string(),
  /** Start of the first quarter hour (UTC epoch seconds). */
  start: z.number().int(),
  /** Cents per MWh for each quarter hour from `start`; null where there is no file. */
  prices: z.array(z.number().int().nullable()),
});
export type OmieFile = z.infer<typeof omieFileSchema>;

/** The price of the quarter hour starting at `ts`, in cents per MWh, or null. */
export function omiePrice(omie: OmieFile, ts: EpochSeconds): number | null {
  const index = (ts - omie.start) / QUARTER_HOUR;
  if (!Number.isInteger(index) || index < 0) return null;
  return omie.prices[index] ?? null;
}

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

/** Hours in a row the app suggests for a machine (a wash, a dishwasher, a charge). */
export const WINDOW_HOURS = 3;

/** A stretch of quarter hours and its average price (cents per MWh). */
export interface PriceWindow {
  from: EpochSeconds;
  to: EpochSeconds;
  average: number;
}

/**
 * The cheapest and the dearest WINDOW_HOURS in a row among quarter-hour prices
 * that start at `start`, from `from` on (e.g. Lisbon midnight: the OMIE day
 * starts at 23:00 in Lisbon). Null with fewer quarter hours than a window.
 */
export function priceWindows(
  start: EpochSeconds,
  prices: readonly number[],
  from: EpochSeconds,
): { cheapest: PriceWindow; dearest: PriceWindow } | null {
  const size = (WINDOW_HOURS * HOUR) / QUARTER_HOUR;
  const first = Math.max(0, Math.ceil((from - start) / QUARTER_HOUR));
  if (prices.length - first < size) return null;
  let sum = 0;
  for (let i = first; i < first + size; i++) sum += prices[i] as number;
  const at = (index: number, total: number): PriceWindow => ({
    from: start + index * QUARTER_HOUR,
    to: start + (index + size) * QUARTER_HOUR,
    average: total / size,
  });
  let cheapest = at(first, sum);
  let dearest = cheapest;
  for (let i = first + 1; i + size <= prices.length; i++) {
    sum += (prices[i + size - 1] as number) - (prices[i - 1] as number);
    // The first of equal windows: the earlier hours.
    if (sum / size < cheapest.average) cheapest = at(i, sum);
    if (sum / size > dearest.average) dearest = at(i, sum);
  }
  return { cheapest, dearest };
}
