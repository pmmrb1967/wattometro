// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Consumption over time from quarter hours: per day (by tariff period), the
 * quarters of one day, and the average hour × weekday profile. Lisbon calendar
 * days (23 h or 25 h when the clocks change).
 */
import {
  lisbonDate,
  lisbonParts,
  nextDate,
  QUARTER_HOUR,
  startOfLisbonDay,
  type EpochSeconds,
  type LocalDate,
} from '../lib/time';
import type { Wh } from '../lib/units';
import type { BillingPeriod, TariffInput } from './tariff';
import { billingPeriod } from './time-cycles';

type Quarter = { ts: EpochSeconds; energyWh: Wh };
/** How the household's tariff splits the day; null for a single price. */
export type Periods = Pick<TariffInput, 'option' | 'cycle' | 'periodsMap'> | null;

export interface PricedQuarter extends Quarter {
  period: BillingPeriod;
}

export interface DayTotal {
  date: LocalDate;
  totalWh: Wh;
  byPeriod: Partial<Record<BillingPeriod, Wh>>;
  quarters: number;
}

const periodOf = (ts: EpochSeconds, periods: Periods): BillingPeriod =>
  periods ? billingPeriod(ts, periods.option, periods.cycle, periods.periodsMap) : 'simple';

/** The quarters of each Lisbon day, with their tariff period, in time order. */
export function quartersByDay(
  quarters: readonly Quarter[],
  periods: Periods,
): Map<LocalDate, PricedQuarter[]> {
  const days = new Map<LocalDate, PricedQuarter[]>();
  const sorted = [...quarters].sort((a, b) => a.ts - b.ts);
  for (const quarter of sorted) {
    const date = lisbonDate(quarter.ts);
    const day = days.get(date) ?? [];
    day.push({ ...quarter, period: periodOf(quarter.ts, periods) });
    days.set(date, day);
  }
  return days;
}

/** Energy of a day, total and by period. */
export function dayTotal(date: LocalDate, quarters: readonly PricedQuarter[]): DayTotal {
  const byPeriod: Partial<Record<BillingPeriod, Wh>> = {};
  let totalWh = 0;
  for (const { energyWh, period } of quarters) {
    totalWh += energyWh;
    byPeriod[period] = (byPeriod[period] ?? 0) + energyWh;
  }
  return { date, totalWh, byPeriod, quarters: quarters.length };
}

/**
 * One series for the house, from the grid meter and a Shelly on the main board:
 * E-Redes up to its last day (what is billed), the Shelly on the days after it
 * (the E-Redes export arrives later, imported by hand). Days the E-Redes data
 * lacks before its last one stay empty: the two are not mixed within the record.
 * An export often ends early in a day (26/10/2026: the first quarter hours
 * only); when the Shelly has that day, it is the Shelly's, whole, and the few
 * E-Redes quarters are left out (they would make the day look nearly empty).
 * `shellyFrom` is the first day taken from the Shelly; null when none is.
 */
export function houseQuarters(
  eredes: readonly Quarter[],
  shelly: readonly Quarter[],
): { quarters: Quarter[]; shellyFrom: LocalDate | null } {
  const last = eredes.reduce<EpochSeconds | null>(
    (latest, { ts }) => (latest === null || ts > latest ? ts : latest),
    null,
  );
  const lastDay = last === null ? null : lisbonDate(last);
  const from = lastDay === null ? null : startOfLisbonDay(lastDay);
  const partial =
    from !== null &&
    lastDay !== null &&
    eredes.filter(({ ts }) => ts >= from).length * QUARTER_HOUR <
      startOfLisbonDay(nextDate(lastDay)) - from &&
    shelly.some(({ ts }) => ts >= from && ts < startOfLisbonDay(nextDate(lastDay)));
  const cut = lastDay === null ? null : partial ? from : startOfLisbonDay(nextDate(lastDay));
  const kept = partial ? eredes.filter(({ ts }) => cut === null || ts < cut) : eredes;
  const after = shelly.filter(({ ts }) => cut === null || ts >= cut);
  const first = after.reduce<EpochSeconds | null>(
    (earliest, { ts }) => (earliest === null || ts < earliest ? ts : earliest),
    null,
  );
  return {
    quarters: [...kept, ...after].sort((a, b) => a.ts - b.ts),
    shellyFrom: first === null ? null : lisbonDate(first),
  };
}

/** Day of the week of a date: 0 = Monday … 6 = Sunday. */
export function weekdayOf(date: LocalDate): number {
  return (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
}

/** Moves a date by whole days (any number, either way). */
export function addDays(date: LocalDate, days: number): LocalDate {
  const moved = new Date(`${date}T12:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
}

/** Monday to Sunday of the week of a date. */
export function weekDates(date: LocalDate): LocalDate[] {
  const monday = addDays(date, -weekdayOf(date));
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

/** Every day of a month ('YYYY-MM'). */
export function monthDates(month: string): LocalDate[] {
  const dates: LocalDate[] = [];
  for (let date = `${month}-01`; date.startsWith(month); date = nextDate(date)) dates.push(date);
  return dates;
}

/** The month ('YYYY-MM') moved by whole months. */
export function addMonths(month: string, months: number): string {
  const moved = new Date(`${month}-15T12:00:00Z`);
  moved.setUTCMonth(moved.getUTCMonth() + months);
  return moved.toISOString().slice(0, 7);
}

export const PROFILE_WEEKS = 12;

/**
 * Average energy per hour, by weekday (0 = Monday) and local hour, over the
 * PROFILE_WEEKS weeks up to `lastDate`. Only hours with data count; null where
 * there is none. The repeated hour of the 25 h day counts once, with both halves.
 */
export function hourlyProfile(
  days: ReadonlyMap<LocalDate, readonly PricedQuarter[]>,
  lastDate: LocalDate,
): (Wh | null)[][] {
  const since = addDays(lastDate, -(PROFILE_WEEKS * 7 - 1));
  const sums = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  const counts = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  for (const [date, quarters] of days) {
    if (date < since || date > lastDate) continue;
    const weekday = weekdayOf(date);
    const hours = new Map<number, Wh>();
    for (const { ts, energyWh } of quarters) {
      const { hour } = lisbonParts(ts);
      hours.set(hour, (hours.get(hour) ?? 0) + energyWh);
    }
    for (const [hour, wh] of hours) {
      (sums[weekday] as number[])[hour] = (sums[weekday]?.[hour] ?? 0) + wh;
      (counts[weekday] as number[])[hour] = (counts[weekday]?.[hour] ?? 0) + 1;
    }
  }
  return sums.map((row, weekday) =>
    row.map((sum, hour) => {
      const count = counts[weekday]?.[hour] ?? 0;
      return count === 0 ? null : Math.round(sum / count);
    }),
  );
}
