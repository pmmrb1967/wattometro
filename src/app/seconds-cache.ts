// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The per-second values of a Lisbon day (GET /v1/seconds), kept in this
 * browser once the day is over: they no longer change, and a day is ~520 KB
 * and 1440 rows read from D1 per channel. Days the Shelly may still be
 * sending (its queue holds 4 h) are always fetched again. At most KEEP_DAYS
 * days are kept. Cleared on sign-out; the demonstration is never kept.
 */
import { isDemo } from '../demo/mode';
import { nextDate, startOfLisbonDay, type EpochSeconds, type LocalDate } from '../lib/time';
import { fetchSeconds, type Failure } from './api';

const DB_NAME = 'wattometro-seconds';
const STORE = 'days';
/** The Shelly's queue (4 h) and a margin: after this a day is complete. */
const SETTLED_SECONDS = 6 * 3600;
export const KEEP_DAYS = 14;

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

/** Runs one request in a transaction; null where IndexedDB is missing or fails. */
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

const keyOf = (household: string, meter: string, day: LocalDate) => `${household}|${meter}|${day}`;

/** The keys to remove so that only the KEEP_DAYS latest days of each meter stay. */
export function keysToDrop(keys: readonly string[]): string[] {
  const byMeter = new Map<string, string[]>();
  for (const key of keys) {
    const meter = key.slice(0, key.lastIndexOf('|'));
    byMeter.set(meter, [...(byMeter.get(meter) ?? []), key]);
  }
  return [...byMeter.values()].flatMap((list) => list.sort().slice(0, -KEEP_DAYS));
}

export async function clearSecondsCache(): Promise<void> {
  await withStore('readwrite', (store) => store.clear());
}

/** The records of a meter's Lisbon day, from this browser when kept, else from the server. */
export async function loadDaySeconds(
  household: string,
  meter: string,
  day: LocalDate,
  now: EpochSeconds = Math.floor(Date.now() / 1000),
): Promise<{ ok: true; records: ArrayBuffer } | Failure> {
  const from = startOfLisbonDay(day);
  const to = startOfLisbonDay(nextDate(day));
  const settled = !isDemo() && now >= to + SETTLED_SECONDS;
  const key = keyOf(household, meter, day);
  if (settled) {
    const kept = await withStore<ArrayBuffer>('readonly', (store) => store.get(key));
    if (kept) return { ok: true, records: kept };
  }
  const fetched = await fetchSeconds(meter, from, to);
  if (fetched.ok && settled) {
    await withStore('readwrite', (store) => store.put(fetched.records, key));
    const keys = await withStore<IDBValidKey[]>('readonly', (store) => store.getAllKeys());
    for (const old of keysToDrop((keys ?? []).map(String))) {
      await withStore('readwrite', (store) => store.delete(old));
    }
  }
  return fetched;
}
