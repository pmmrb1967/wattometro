// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Baseload: what the house draws when nothing is in use (fridge, routers,
 * standby). Each night, the 10th percentile of the quarter-hour average power
 * between 00:00 and 06:00 Lisbon time (a percentile, not the minimum, so one odd
 * quarter does not decide it); per month, the median of the nights.
 *
 * With quarter hours (E-Redes) short pauses of the fridge are averaged in, so
 * the value is a little above the real one; the Shelly's minutes will refine it.
 */
import type { Cents } from '../lib/money';
import { lisbonDate, lisbonParts, type EpochSeconds, type LocalDate } from '../lib/time';
import type { Watts, Wh } from '../lib/units';
import { electricityCost, energyByPeriod, type EnergyByPeriod } from './electricity-cost';
import type { BillingPeriod, TariffInput } from './tariff';

/** The night window, local hours [from, to). */
export const NIGHT_FROM_HOUR = 0;
export const NIGHT_TO_HOUR = 6;
/** A night needs at least half of its 24 quarter hours. */
export const MIN_NIGHT_QUARTERS = 12;
const PERCENTILE = 10;
/** "Now": the nights of the last 30 days of data. */
export const RECENT_DAYS = 30;
const QUARTERS_PER_YEAR = 365 * 96;
const DAY = 86_400;

type Quarter = { ts: EpochSeconds; energyWh: Wh };

export interface NightBaseload {
  /** The calendar day the night window falls on. */
  date: LocalDate;
  watts: Watts;
  quarters: number;
}

export interface MonthBaseload {
  /** 'YYYY-MM'. */
  month: string;
  watts: Watts;
  nights: number;
}

/** Nearest-rank percentile of integers (at least one). */
function percentile(values: readonly number[], pct: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((pct * sorted.length) / 100));
  return sorted[rank - 1] as number;
}

/** Median of integers (at least one), rounded to an integer. */
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] as number)
    : Math.round(((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2);
}

/** Baseload of each night with enough data, in date order. */
export function nightlyBaseload(quarters: readonly Quarter[]): NightBaseload[] {
  const nights = new Map<LocalDate, Watts[]>();
  for (const { ts, energyWh } of quarters) {
    const { hour } = lisbonParts(ts);
    if (hour < NIGHT_FROM_HOUR || hour >= NIGHT_TO_HOUR) continue;
    const date = lisbonDate(ts);
    const watts = nights.get(date) ?? [];
    // Wh in a quarter hour × 4 = average W.
    watts.push(energyWh * 4);
    nights.set(date, watts);
  }
  return [...nights]
    .filter(([, watts]) => watts.length >= MIN_NIGHT_QUARTERS)
    .map(([date, watts]) => ({
      date,
      watts: percentile(watts, PERCENTILE),
      quarters: watts.length,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Median of the nights of each calendar month, in month order. */
export function monthlyBaseload(nights: readonly NightBaseload[]): MonthBaseload[] {
  const months = new Map<string, Watts[]>();
  for (const night of nights) {
    const month = night.date.slice(0, 7);
    months.set(month, [...(months.get(month) ?? []), night.watts]);
  }
  return [...months]
    .map(([month, watts]) => ({ month, watts: median(watts), nights: watts.length }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

/** Median of the nights in the RECENT_DAYS days up to the last night, or null without nights. */
export function recentBaseload(
  nights: readonly NightBaseload[],
): { watts: Watts; nights: number } | null {
  const last = nights.at(-1);
  if (!last) return null;
  // Noon avoids the 23 h and 25 h days.
  const since = lisbonDate(Date.parse(`${last.date}T12:00:00Z`) / 1000 - (RECENT_DAYS - 1) * DAY);
  const recent = nights.filter((night) => night.date >= since).map((night) => night.watts);
  return { watts: median(recent), nights: recent.length };
}

/**
 * What the baseload costs in a year like the one measured: the cost of the
 * year's consumption minus the cost without the baseload, with the household's
 * tariff (energy, IEC and VAT; the power term is paid either way). The baseload
 * runs every hour, so it is split by period like the hours of the data.
 */
export function baseloadCost(
  watts: Watts,
  quarters: readonly Quarter[],
  tariff: TariffInput,
): { annualWh: Wh; annualCents: Cents } | null {
  if (quarters.length === 0 || watts <= 0) return null;
  const scale = QUARTERS_PER_YEAR / quarters.length;
  const used = energyByPeriod(quarters, tariff);
  // Quarter hours of each period (one "Wh" per quarter).
  const hours = energyByPeriod(
    quarters.map(({ ts }) => ({ ts, energyWh: 1 })),
    tariff,
  );
  const year: EnergyByPeriod = {};
  const without: EnergyByPeriod = {};
  let annualWh = 0;
  for (const [period, count] of Object.entries(hours) as [BillingPeriod, number][]) {
    const usedWh = Math.round((used[period] ?? 0) * scale);
    // W × 1/4 h per quarter hour.
    const baseWh = Math.round((count * scale * watts) / 4);
    year[period] = usedWh;
    without[period] = Math.max(0, usedWh - baseWh);
    annualWh += baseWh;
  }
  const annualCents =
    electricityCost(year, 365, tariff).totalCents -
    electricityCost(without, 365, tariff).totalCents;
  return { annualWh, annualCents };
}
