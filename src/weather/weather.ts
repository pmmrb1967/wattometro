// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Hourly air temperature at the house's locality, from Open-Meteo
 * (docs/open-meteo.md): the archive for the past, the forecast for the last
 * days and the next 16. Kept in this browser (IndexedDB), a UTC month per
 * record, so only new months are asked again. Nothing about consumption
 * leaves the browser; only the locality's rounded coordinates do.
 */
import { z } from 'zod';
import { isDemo } from '../demo/mode';
import {
  HOUR,
  lisbonDate,
  nextDate,
  startOfLisbonDay,
  type EpochSeconds,
  type LocalDate,
} from '../lib/time';
import { toTenthsCelsius, type TenthsCelsius } from '../lib/units';

const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
export const FORECAST_DAYS = 16;
/** Days asked from the forecast before today: covers the archive's delay. */
const FORECAST_PAST_DAYS = 10;
/** A month older than this many days is final in the archive (ERA5: 5 days). */
const FINAL_AFTER_DAYS = 8;
/** The forecast is asked again after this time. */
const FORECAST_FRESH_MS = 60 * 60 * 1000;
const DAY = 86_400;

/** A locality in hundredths of a degree (src/app/api.ts HouseholdLocation). */
export interface WeatherLocation {
  latitudeCdeg: number;
  longitudeCdeg: number;
}

/** One hour: its UTC start and the temperature, null where the service has none. */
export type HourTemperature = [ts: EpochSeconds, tenths: TenthsCelsius | null];

const HourlyResponse = z.object({
  hourly: z.object({
    time: z.array(z.number().int()),
    temperature_2m: z.array(z.number().nullable()),
  }),
});

/** The hours of an Open-Meteo answer (requested with timeformat=unixtime); null if malformed. */
export function parseHourly(json: unknown): HourTemperature[] | null {
  const parsed = HourlyResponse.safeParse(json);
  if (!parsed.success) return null;
  const { time, temperature_2m: temperature } = parsed.data.hourly;
  if (time.length !== temperature.length) return null;
  return time.map((ts, index) => {
    const celsius = temperature[index];
    return [ts, celsius == null ? null : toTenthsCelsius(celsius)];
  });
}

/** A day needs this many hours with a value to have a mean. */
export const MIN_HOURS_PER_DAY = 20;

/**
 * The mean temperature of each Lisbon day (hours in time order), for the days
 * with at least MIN_HOURS_PER_DAY hours. Days of 23 h and 25 h count their own hours.
 */
export function dailyMeans(hours: readonly HourTemperature[]): Map<LocalDate, TenthsCelsius> {
  const means = new Map<LocalDate, TenthsCelsius>();
  let date: LocalDate | null = null;
  let end = 0;
  let sum = 0;
  let count = 0;
  const close = () => {
    if (date !== null && count >= MIN_HOURS_PER_DAY) means.set(date, Math.round(sum / count));
  };
  for (const [ts, tenths] of hours) {
    if (date === null || ts >= end) {
      close();
      date = lisbonDate(ts);
      end = startOfLisbonDay(nextDate(date));
      sum = 0;
      count = 0;
    }
    if (tenths !== null) {
      sum += tenths;
      count++;
    }
  }
  close();
  return means;
}

/** Years of the archive kept for the usual temperature of each time of year. */
export const CLIMATE_YEARS = 5;

/** Days on each side of a date that count for its usual temperature. */
export const CLIMATE_WINDOW_DAYS = 7;

const dayOfYear = (date: LocalDate) => {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / (DAY * 1000));
};

/**
 * The usual temperature of a date: the mean of the daily means within
 * ±CLIMATE_WINDOW_DAYS of the same day of the year, over every year given.
 * Used for the days beyond the forecast. Null without any such day.
 */
export function climateNormal(
  daily: ReadonlyMap<LocalDate, TenthsCelsius>,
): (date: LocalDate) => TenthsCelsius | null {
  // Sums per day of the year (0–365), then a circular window.
  const sums = new Array<number>(366).fill(0);
  const counts = new Array<number>(366).fill(0);
  for (const [date, tenths] of daily) {
    const index = dayOfYear(date);
    sums[index]! += tenths;
    counts[index]!++;
  }
  return (date) => {
    const center = dayOfYear(date);
    let sum = 0;
    let count = 0;
    for (let offset = -CLIMATE_WINDOW_DAYS; offset <= CLIMATE_WINDOW_DAYS; offset++) {
      const index = (center + offset + 366) % 366;
      sum += sums[index]!;
      count += counts[index]!;
    }
    return count === 0 ? null : Math.round(sum / count);
  };
}

/** Fictional weather for the demonstration: a Lisbon-like year, warmest at 15:00. */
export function demoHours(from: EpochSeconds, to: EpochSeconds): HourTemperature[] {
  const hours: HourTemperature[] = [];
  for (let ts = Math.ceil(from / HOUR) * HOUR; ts < to; ts += HOUR) {
    const year = (ts / DAY - 15) / 365.25; // coldest mid-January
    const seasonal = 170 - 60 * Math.cos(2 * Math.PI * year);
    const daily = 40 * Math.cos((2 * Math.PI * ((ts % DAY) / HOUR - 14)) / 24);
    const noise = 15 * Math.sin(ts / 97_000) + 10 * Math.sin(ts / 351_000);
    hours.push([ts, Math.round(seasonal + daily + noise)]);
  }
  return hours;
}

// ---- Fetching and the browser cache ----

const DB_NAME = 'wattometro-weather';
const STORE = 'months';
/** Stored value meaning "no value" (an int16 never seen as a temperature). */
const MISSING = -32768;

interface MonthRecord {
  /** The hours of the UTC month, from its first hour, as tenths of °C (MISSING = none). */
  tenths: Int16Array;
  /** Whether the archive will not change it any more. */
  final: boolean;
}

const pad = (value: number) => String(value).padStart(2, '0');
const utcDate = (ts: EpochSeconds) => {
  const date = new Date(ts * 1000);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
};
const monthStart = (year: number, month: number) => Date.UTC(year, month, 1) / 1000;

/** The UTC months that overlap [from, to), as [key 'YYYY-MM', start, end]. */
export function utcMonths(from: EpochSeconds, to: EpochSeconds): [string, number, number][] {
  const months: [string, number, number][] = [];
  const first = new Date(from * 1000);
  let year = first.getUTCFullYear();
  let month = first.getUTCMonth();
  for (let start = monthStart(year, month); start < to; start = monthStart(year, month)) {
    months.push([`${year}-${pad(month + 1)}`, start, monthStart(year, month + 1)]);
    month++;
    if (month === 12) {
      month = 0;
      year++;
    }
  }
  return months;
}

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

const forecastMemory = new Map<string, { fetchedAt: number; hours: HourTemperature[] }>();

/** Forgets the kept weather (sign-out: it reveals the locality). */
export async function clearWeatherCache(): Promise<void> {
  forecastMemory.clear();
  await withStore('readwrite', (store) => store.clear());
}

const coordinates = (location: WeatherLocation) => ({
  latitude: (location.latitudeCdeg / 100).toFixed(2),
  longitude: (location.longitudeCdeg / 100).toFixed(2),
});

async function getHourly(url: string, params: Record<string, string>) {
  try {
    const response = await fetch(`${url}?${new URLSearchParams(params)}`);
    if (!response.ok) return null;
    return parseHourly(await response.json());
  } catch {
    return null;
  }
}

/** Fills the months of [from, to) that are not final from the archive. Null when it failed. */
async function archiveMonths(
  location: WeatherLocation,
  from: EpochSeconds,
  to: EpochSeconds,
  nowTs: EpochSeconds,
): Promise<HourTemperature[] | null> {
  const key = `${location.latitudeCdeg},${location.longitudeCdeg}`;
  const lastArchived = Math.floor(nowTs / DAY) * DAY - DAY; // yesterday, UTC
  const months = utcMonths(from, Math.min(to, lastArchived + DAY));
  const kept = await Promise.all(
    months.map(([month]) =>
      withStore<MonthRecord>('readonly', (store) => store.get(`${key}:${month}`)),
    ),
  );
  const hours: HourTemperature[] = [];
  // Consecutive months to ask for share one request.
  let pending: [string, number, number][] = [];
  const flush = async () => {
    const first = pending[0];
    const last = pending.at(-1);
    if (!first || !last) return true;
    const fetched = await getHourly(ARCHIVE_URL, {
      ...coordinates(location),
      start_date: utcDate(first[1]),
      end_date: utcDate(Math.min(last[2], lastArchived + DAY) - DAY),
      hourly: 'temperature_2m',
      timeformat: 'unixtime',
    });
    if (!fetched) return false;
    const byTs = new Map(fetched);
    for (const [month, start, end] of pending) {
      const tenths = new Int16Array((end - start) / HOUR).fill(MISSING);
      tenths.forEach((_, index) => {
        const value = byTs.get(start + index * HOUR);
        if (value != null) tenths[index] = value;
      });
      const final = end <= nowTs - FINAL_AFTER_DAYS * DAY;
      await withStore('readwrite', (store) =>
        store.put({ tenths, final } satisfies MonthRecord, `${key}:${month}`),
      );
      hours.push(...monthHours(start, tenths));
    }
    pending = [];
    return true;
  };
  for (const [index, month] of months.entries()) {
    const record = kept[index];
    if (record?.final) {
      if (!(await flush())) return null;
      hours.push(...monthHours(month[1], record.tenths));
    } else {
      pending.push(month);
    }
  }
  if (!(await flush())) return null;
  return hours.filter(([ts]) => ts >= from && ts < to);
}

function monthHours(start: EpochSeconds, tenths: Int16Array): HourTemperature[] {
  return Array.from(tenths, (value, index) => [
    start + index * HOUR,
    value === MISSING ? null : value,
  ]);
}

async function forecastHours(location: WeatherLocation): Promise<HourTemperature[] | null> {
  const key = `${location.latitudeCdeg},${location.longitudeCdeg}`;
  const kept = forecastMemory.get(key);
  if (kept && Date.now() - kept.fetchedAt < FORECAST_FRESH_MS) return kept.hours;
  const hours = await getHourly(FORECAST_URL, {
    ...coordinates(location),
    hourly: 'temperature_2m',
    timeformat: 'unixtime',
    past_days: String(FORECAST_PAST_DAYS),
    forecast_days: String(FORECAST_DAYS),
  });
  if (hours) forecastMemory.set(key, { fetchedAt: Date.now(), hours });
  return hours;
}

/**
 * Hourly temperature in [from, to) (UTC hour starts, in time order): the
 * archive where it has a value, the forecast elsewhere (recent days and up to
 * 16 days ahead). Null when the weather could not be fetched.
 */
export async function loadHourlyTemperature(
  location: WeatherLocation,
  from: EpochSeconds,
  to: EpochSeconds,
): Promise<HourTemperature[] | null> {
  if (isDemo()) return demoHours(from, to);
  const nowTs = Math.floor(Date.now() / 1000);
  const [archive, forecast] = await Promise.all([
    archiveMonths(location, from, to, nowTs),
    forecastHours(location),
  ]);
  if (!archive && !forecast) return null;
  const merged = new Map<EpochSeconds, TenthsCelsius | null>();
  for (const [ts, tenths] of forecast ?? []) if (ts >= from && ts < to) merged.set(ts, tenths);
  for (const [ts, tenths] of archive ?? []) if (tenths !== null) merged.set(ts, tenths);
  return [...merged].sort((a, b) => a[0] - b[0]);
}
