// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Days that used far more (or far less) than usual. Each day is compared with
 * the recent days of the same kind (working day, Saturday, Sunday or public
 * holiday: bill-forecast.ts), and, when the installation follows the weather,
 * only with those of a similar temperature (a day without enough of them is
 * not judged).
 *
 * The test is a robust z-score (Iglewicz & Hoaglin, 1993, "How to Detect and
 * Handle Outliers"): (x − median) / (1.4826 × MAD), an outlier from 3.5. The
 * median and the median absolute deviation are not moved by the odd days they
 * are meant to find, as a mean and a standard deviation would be. The spread
 * never counts below MIN_SPREAD_SHARE of the median, so a very regular house
 * is not flagged for a few percent.
 *
 * Where in the day: the run of hours whose excess over the usual hour adds up
 * most (largest contiguous sum). Energy stays in integer Wh; the cost of the
 * excess comes from the tariff (energy, IEC and VAT), like the baseload's.
 */
import { electricityCost, type EnergyByPeriod } from '../domain/electricity-cost';
import type { Cents } from '../lib/money';
import {
  lisbonParts,
  nextDate,
  startOfLisbonDay,
  type EpochSeconds,
  type LocalDate,
} from '../lib/time';
import type { TenthsCelsius, Wh } from '../lib/units';
import { addDays } from '../domain/consumption';
import type { TariffInput } from '../domain/tariff';
import {
  dayKind,
  prepareForecast,
  type DayKind,
  type ForecastData,
  type TemperatureOf,
} from './bill-forecast';

/** Days of the same kind compared with, at most, the most recent first. */
export const REFERENCE_DAYS = 12;
/** Fewer than this and the day is not judged. */
export const MIN_REFERENCE_DAYS = 6;
/** How far back the reference days may go. */
export const LOOKBACK_DAYS = 12 * 7;
/** Reference days within this temperature of the day (tenths of °C), when it matters. */
export const TEMPERATURE_BAND = 30;
/** Robust z-score from which a day is unusual (Iglewicz & Hoaglin). */
export const Z_THRESHOLD = 3.5;
/** The spread never counts below this share of the median (a regular house). */
export const MIN_SPREAD_SHARE = 0.05;
/** 1 / Φ⁻¹(3/4): the MAD of normal data times this is its standard deviation. */
const MAD_SCALE = 1.4826;

export interface Anomaly {
  date: LocalDate;
  kind: DayKind;
  actualWh: Wh;
  /** The median of the reference days. */
  expectedWh: Wh;
  /** Robust z-score, rounded to tenths (35 = 3.5). */
  zTenths: number;
  direction: 1 | -1;
  references: number;
  /** Compared only with days of a similar temperature. */
  temperatureMatched: boolean;
  /** The local hours [from, to) that explain most of it, and their excess (negative: below). */
  span: { from: number; to: number; excessWh: Wh } | null;
  /** What the difference cost (negative: saved), with energy, IEC and VAT; null without a tariff. */
  excessCents: Cents | null;
}

interface DayHours {
  date: LocalDate;
  wh: Wh;
  /** Energy per local hour (0–23); the repeated hour of the 25 h day adds up. */
  hours: Wh[];
  quarters: { ts: EpochSeconds; energyWh: Wh }[];
  /** The local hour of each quarter, in the same order. */
  quarterHours: number[];
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] as number)
    : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}

/** Local hour of each quarter; only the days the clocks change need the time zone. */
function localHours(date: LocalDate, quarters: readonly { ts: EpochSeconds }[]): number[] {
  const start = startOfLisbonDay(date);
  const regular = startOfLisbonDay(nextDate(date)) - start === 86_400;
  return quarters.map(({ ts }) =>
    regular ? Math.floor((ts - start) / 3600) : lisbonParts(ts).hour,
  );
}

/** The complete days, with their hours, oldest first. */
function completeDays(data: ForecastData): DayHours[] {
  return [...data.days.values()]
    .filter((day) => day.complete)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((day) => {
      const quarterHours = localHours(day.date, day.quarters);
      const hours = new Array<Wh>(24).fill(0);
      day.quarters.forEach(({ energyWh }, i) => {
        const hour = quarterHours[i] as number;
        hours[hour] = (hours[hour] ?? 0) + energyWh;
      });
      return { date: day.date, wh: day.wh, hours, quarters: day.quarters, quarterHours };
    });
}

/**
 * The contiguous hours with the largest excess (or shortfall, for −1), each
 * hour discounted by its own usual spread, so an hour within its everyday
 * variation does not widen the span. The excess reported is the plain one.
 */
function strongestSpan(
  excess: readonly number[],
  spreads: readonly number[],
  direction: 1 | -1,
): { from: number; to: number; excessWh: Wh } | null {
  let best = 0;
  let bestFrom = 0;
  let bestTo = 0;
  let sum = 0;
  let from = 0;
  excess.forEach((value, hour) => {
    if (sum <= 0) {
      sum = 0;
      from = hour;
    }
    sum += value * direction - (spreads[hour] ?? 0);
    if (sum > best) {
      best = sum;
      bestFrom = from;
      bestTo = hour + 1;
    }
  });
  if (best <= 0) return null;
  const excessWh = excess.slice(bestFrom, bestTo).reduce((total, value) => total + value, 0);
  return { from: bestFrom, to: bestTo, excessWh: Math.round(excessWh) };
}

/** The robust spread of values around their median (at least MIN_SPREAD_SHARE of it, and 1). */
function spreadOf(values: readonly number[], center: number): number {
  const mad = median(values.map((value) => Math.abs(value - center)));
  return Math.max(MAD_SCALE * mad, MIN_SPREAD_SHARE * center, 1);
}

/** The day's energy cost minus the cost of the usual day, spread over the day's quarters by hour. */
function excessCost(
  day: DayHours,
  expectedHours: readonly number[],
  data: ForecastData,
): Cents | null {
  const tariff = data.tariff;
  if (!tariff) return null;
  const periods = data.periodsOf(day.date);
  const start = startOfLisbonDay(day.date);
  const perHour = new Array<number>(24).fill(0);
  for (const hour of day.quarterHours) perHour[hour] = (perHour[hour] ?? 0) + 1;
  const actual: EnergyByPeriod = {};
  const usual: EnergyByPeriod = {};
  day.quarters.forEach(({ ts, energyWh }, i) => {
    const period = periods[Math.floor((ts - start) / 900)];
    if (!period) return;
    const hour = day.quarterHours[i] as number;
    actual[period] = (actual[period] ?? 0) + energyWh;
    usual[period] =
      (usual[period] ?? 0) + Math.round((expectedHours[hour] ?? 0) / (perHour[hour] ?? 1));
  });
  return (
    electricityCost(actual, 1, tariff).totalCents - electricityCost(usual, 1, tariff).totalCents
  );
}

/** A day's total energy; `wh` is all `judgeDay` reads. */
export interface DayTotal {
  date: LocalDate;
  wh: Wh;
}

export interface DayJudgement<T extends DayTotal> {
  kind: DayKind;
  /** The median of the reference days. */
  expected: number;
  /** Robust z-score: at least Z_THRESHOLD away from 0. */
  z: number;
  references: T[];
  temperatureMatched: boolean;
}

/**
 * Is `days[index]` unusual? Against the REFERENCE_DAYS most recent days of the
 * same kind within LOOKBACK_DAYS (`days`: complete days only, oldest first),
 * of a similar temperature when `temperatureOf` is given. Null when it is
 * usual or cannot be judged. Shared with the server's push alert
 * (server/src/alerts.ts), which has the daily totals only.
 */
export function judgeDay<T extends DayTotal>(
  days: readonly T[],
  index: number,
  temperatureOf: TemperatureOf | null = null,
): DayJudgement<T> | null {
  const day = days[index];
  if (!day) return null;
  const kind = dayKind(day.date);
  const earliest = startOfLisbonDay(day.date) - LOOKBACK_DAYS * 86_400;
  const sameKind: T[] = [];
  for (let i = index - 1; i >= 0; i--) {
    const other = days[i] as T;
    if (startOfLisbonDay(other.date) < earliest) break;
    if (dayKind(other.date) === kind) sameKind.push(other);
  }
  const temperature: TenthsCelsius | null = temperatureOf ? temperatureOf(day.date) : null;
  let references = sameKind;
  let temperatureMatched = false;
  if (temperature !== null && temperatureOf) {
    const similar = sameKind.filter((other) => {
      const t = temperatureOf(other.date);
      return t !== null && Math.abs(t - temperature) <= TEMPERATURE_BAND;
    });
    // Too few days like it: not judged, rather than compared with other weather.
    if (similar.length < MIN_REFERENCE_DAYS) return null;
    references = similar;
    temperatureMatched = true;
  }
  references = references.slice(0, REFERENCE_DAYS);
  if (references.length < MIN_REFERENCE_DAYS) return null;

  const totals = references.map((other) => other.wh);
  const expected = median(totals);
  const z = (day.wh - expected) / spreadOf(totals, expected);
  if (Math.abs(z) < Z_THRESHOLD) return null;
  return { kind, expected, z, references, temperatureMatched };
}

/** How far back the app lists them ("Consumo", and the AI's get_anomalies). */
export const RECENT_ANOMALY_DAYS = 90;

/**
 * The unusual days of the last RECENT_ANOMALY_DAYS, newest first, as the app
 * shows them. `daily`: mean temperature per day, or null when it does not matter.
 */
export function recentAnomalies(
  quarters: readonly { ts: EpochSeconds; energyWh: Wh }[],
  tariff: TariffInput | null,
  daily: ReadonlyMap<LocalDate, TenthsCelsius> | null,
  today: LocalDate,
): Anomaly[] {
  const temperatureOf = daily ? (date: LocalDate) => daily.get(date) ?? null : null;
  return findAnomalies(
    prepareForecast(quarters, tariff),
    addDays(today, -RECENT_ANOMALY_DAYS),
    temperatureOf,
  ).reverse();
}

/**
 * Every complete day from `from` on (inclusive) that is unusual, oldest first.
 * `temperatureOf` only when the installation follows the weather.
 */
export function findAnomalies(
  data: ForecastData,
  from: LocalDate,
  temperatureOf: TemperatureOf | null = null,
): Anomaly[] {
  const days = completeDays(data);
  const found: Anomaly[] = [];
  days.forEach((day, index) => {
    if (day.date < from) return;
    const judged = judgeDay(days, index, temperatureOf);
    if (!judged) return;
    const { kind, expected, z, references, temperatureMatched } = judged;

    const direction: 1 | -1 = z > 0 ? 1 : -1;
    const byHour = Array.from({ length: 24 }, (_, hour) =>
      references.map((other) => other.hours[hour] ?? 0),
    );
    const expectedHours = byHour.map(median);
    const spreads = byHour.map((values, hour) => spreadOf(values, expectedHours[hour] ?? 0));
    const excess = day.hours.map((wh, hour) => wh - (expectedHours[hour] ?? 0));
    found.push({
      date: day.date,
      kind,
      actualWh: day.wh,
      expectedWh: Math.round(expected),
      zTenths: Math.round(z * 10),
      direction,
      references: references.length,
      temperatureMatched,
      span: strongestSpan(excess, spreads, direction),
      excessCents: excessCost(day, expectedHours, data),
    });
  });
  return found;
}
