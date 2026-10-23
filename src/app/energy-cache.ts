// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The quarter hours of a meter, kept in this browser (IndexedDB) so a visit does
 * not read a year of rows from D1 again. On each visit the app asks for the
 * daily totals (one row per day) and fetches only the days that are missing or
 * whose sum no longer matches (new data, a new E-Redes import, late Shelly
 * minutes). Pages share the result for a few minutes in memory. Cleared on
 * sign-out; the demonstration is never kept.
 */
import { isDemo } from '../demo/mode';
import {
  lisbonDate,
  nextDate,
  startOfLisbonDay,
  type EpochSeconds,
  type LocalDate,
} from '../lib/time';
import { fetchDailyEnergy, fetchQuarterEnergy, type Failure } from './api';

export type Quarter = { ts: EpochSeconds; energyWh: number };

const DB_NAME = 'wattometro-cache';
const STORE = 'quarters';
/** Within this time another page reuses what was just checked. */
const FRESH_MS = 5 * 60 * 1000;
/** More separate ranges to fetch than this: one request from the first to the last. */
const MAX_RANGES = 6;

/** Sum of the quarters of each Lisbon day (quarters in time order). */
export function daySums(quarters: readonly Quarter[]): Map<LocalDate, number> {
  const sums = new Map<LocalDate, number>();
  let date: LocalDate | null = null;
  let end = 0;
  for (const { ts, energyWh } of quarters) {
    // The date only when a day ends: a few hundred calls, not one per quarter.
    if (date === null || ts >= end) {
      date = lisbonDate(ts);
      end = startOfLisbonDay(nextDate(date));
    }
    sums.set(date, (sums.get(date) ?? 0) + energyWh);
  }
  return sums;
}

/**
 * The days to fetch again, as ranges of consecutive server days: those not kept
 * or whose sum differs. At most MAX_RANGES ranges.
 */
export function staleRanges(
  kept: ReadonlyMap<LocalDate, number>,
  server: readonly [LocalDate, number][],
): [LocalDate, LocalDate][] {
  const ranges: [LocalDate, LocalDate][] = [];
  let previousStale = false;
  for (const [date, wh] of server) {
    const stale = kept.get(date) !== wh;
    if (stale) {
      const last = ranges.at(-1);
      if (previousStale && last) last[1] = date;
      else ranges.push([date, date]);
    }
    previousStale = stale;
  }
  const first = ranges[0];
  const last = ranges.at(-1);
  return first && last && ranges.length > MAX_RANGES ? [[first[0], last[1]]] : ranges;
}

/**
 * The kept quarters in [from, to) without the days the server no longer has
 * and without the ranges fetched again, plus those, in time order.
 */
export function mergeQuarters(
  kept: readonly Quarter[],
  serverDays: ReadonlySet<LocalDate>,
  ranges: readonly { from: EpochSeconds; to: EpochSeconds; quarters: readonly Quarter[] }[],
  from: EpochSeconds,
  to: EpochSeconds,
): Quarter[] {
  const sums = daySums(kept);
  const gone = new Set([...sums.keys()].filter((date) => !serverDays.has(date)));
  const goneRanges = [...gone].map((date) => [
    startOfLisbonDay(date),
    startOfLisbonDay(nextDate(date)),
  ]);
  const replaced = (ts: EpochSeconds) =>
    ranges.some((range) => ts >= range.from && ts < range.to) ||
    goneRanges.some(([start, end]) => ts >= (start as number) && ts < (end as number));
  return [
    ...kept.filter(({ ts }) => ts >= from && ts < to && !replaced(ts)),
    ...ranges.flatMap((range) => range.quarters),
  ].sort((a, b) => a.ts - b.ts);
}

// Records as on the wire (uint32 ts · uint32 Wh): a year is ~280 KB.
function encode(quarters: readonly Quarter[]): Uint8Array {
  const records = new Uint8Array(quarters.length * 8);
  const view = new DataView(records.buffer);
  quarters.forEach(({ ts, energyWh }, index) => {
    view.setUint32(index * 8, ts, true);
    view.setUint32(index * 8 + 4, energyWh, true);
  });
  return records;
}

function decode(records: Uint8Array): Quarter[] {
  const view = new DataView(records.buffer, records.byteOffset, records.byteLength);
  const quarters: Quarter[] = [];
  for (let offset = 0; offset + 8 <= view.byteLength; offset += 8) {
    quarters.push({ ts: view.getUint32(offset, true), energyWh: view.getUint32(offset + 4, true) });
  }
  return quarters;
}

/** The cache database, or null where IndexedDB is missing or blocked (private mode). */
function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const request = action(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    } finally {
      db.close();
    }
  });
}

const memory = new Map<
  string,
  { checkedAt: number; from: number; to: number; quarters: Quarter[] }
>();

/** Forgets every kept quarter (sign-out). Changed data needs nothing: the daily check finds it. */
export async function clearEnergyCache(): Promise<void> {
  memory.clear();
  await withStore('readwrite', (store) => store.clear());
}

/** The quarter hours of a meter in [from, to) (whole Lisbon days), from the cache and the server. */
export async function loadQuarters(
  household: string,
  meter: string,
  from: EpochSeconds,
  to: EpochSeconds,
): Promise<{ ok: true; quarters: Quarter[] } | Failure> {
  if (isDemo()) return fetchQuarterEnergy(meter, from, to);
  const key = `${household}:${meter}`;
  const recent = memory.get(key);
  if (
    recent &&
    recent.from === from &&
    recent.to === to &&
    Date.now() - recent.checkedAt < FRESH_MS
  ) {
    return { ok: true, quarters: recent.quarters };
  }

  const [stored, daily] = await Promise.all([
    recent ? Promise.resolve(null) : withStore<Uint8Array>('readonly', (store) => store.get(key)),
    fetchDailyEnergy(meter, from, to),
  ]);
  if (!daily.ok) return daily;
  const before = recent?.quarters ?? (stored ? decode(stored) : []);
  const kept = before.filter(({ ts }) => ts >= from && ts < to);

  const ranges = staleRanges(daySums(kept), daily.days).map(([first, last]) => ({
    from: startOfLisbonDay(first),
    to: startOfLisbonDay(nextDate(last)),
  }));
  const fetched = [];
  for (const range of ranges) {
    const outcome = await fetchQuarterEnergy(meter, range.from, range.to);
    if (!outcome.ok) return outcome;
    fetched.push({ ...range, quarters: outcome.quarters });
  }
  const quarters = mergeQuarters(
    kept,
    new Set(daily.days.map(([date]) => date)),
    fetched,
    from,
    to,
  );
  memory.set(key, { checkedAt: Date.now(), from, to, quarters });
  if (fetched.length > 0 || quarters.length !== before.length) {
    await withStore('readwrite', (store) => store.put(encode(quarters), key));
  }
  return { ok: true, quarters };
}
