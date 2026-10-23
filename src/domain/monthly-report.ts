// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Monthly report: a month's consumption against the month before and the same
 * month a year before (by average per day, so missing days and 30/31-day
 * months do not count as changes), its estimated cost, baseload, highest
 * quarter hour, and suggestions from fixed rules (no AI). The thresholds are
 * choices of the app, not regulatory values (planning/plan.md, "Decisões").
 */
import type { Cents } from '../lib/money';
import { lisbonDate, startOfLisbonDay, type EpochSeconds, type LocalDate } from '../lib/time';
import type { Watts, Wh } from '../lib/units';
import { baseloadCost, monthlyBaseload, nightlyBaseload } from './baseload';
import { addMonths, monthDates } from './consumption';
import {
  electricityCost,
  energyByPeriod,
  type Cost,
  type EnergyByPeriod,
} from './electricity-cost';
import type { TariffInput } from './tariff';

type Quarter = { ts: EpochSeconds; energyWh: Wh };

/** Baseload above this share of the month's energy: worth looking at what stays on. */
export const BASELOAD_SHARE_PCT = 20;
/** Tri-hourly: more than this in the peak period. */
export const PEAK_SHARE_PCT = 25;
/** Bi-hourly: more than this out of the empty period. */
export const OFF_EMPTY_SHARE_PCT = 65;
/** Per day, this much above the same month a year before. */
export const HIGHER_THAN_LAST_YEAR_PCT = 15;
/** Highest quarter hour below this share of the contracted power. */
export const LOW_PEAK_PCT = 50;

export interface MonthUsage {
  month: string;
  totalWh: Wh;
  /** Days of the month with data, and days in the month. */
  daysWithData: number;
  days: number;
  /** Average per day with data. */
  perDayWh: Wh;
}

export type Suggestion =
  | { kind: 'baseload'; pct: number; watts: Watts }
  | { kind: 'peak'; pct: number }
  | { kind: 'offEmpty'; pct: number }
  | { kind: 'higherThanLastYear'; pct: number }
  | { kind: 'lowPeak'; peakWatts: Watts; powerVa: number }
  | { kind: 'simpleTariff' };

export interface MonthlyReport {
  usage: MonthUsage;
  previous: MonthUsage | null;
  lastYear: MonthUsage | null;
  /** Per-day change, %, rounded; null without the other month. */
  vsPrevious: number | null;
  vsLastYear: number | null;
  byPeriod: EnergyByPeriod;
  /** With the tariff, for the days with data. */
  cost: Cost | null;
  baseload: { watts: Watts; nights: number; cents: Cents | null } | null;
  /** The quarter hour with the highest average power. */
  peak: { ts: EpochSeconds; watts: Watts } | null;
  suggestions: Suggestion[];
}

function quartersOf(quarters: readonly Quarter[], month: string): Quarter[] {
  const from = startOfLisbonDay(`${month}-01`);
  const to = startOfLisbonDay(`${addMonths(month, 1)}-01`);
  return quarters.filter(({ ts }) => ts >= from && ts < to);
}

export function monthUsage(quarters: readonly Quarter[], month: string): MonthUsage | null {
  if (quarters.length === 0) return null;
  const dates = new Set<LocalDate>();
  let totalWh = 0;
  for (const { ts, energyWh } of quarters) {
    dates.add(lisbonDate(ts));
    totalWh += energyWh;
  }
  return {
    month,
    totalWh,
    daysWithData: dates.size,
    days: monthDates(month).length,
    perDayWh: Math.round(totalWh / dates.size),
  };
}

const change = (now: MonthUsage, before: MonthUsage | null) =>
  before && before.perDayWh > 0
    ? Math.round(((now.perDayWh - before.perDayWh) * 100) / before.perDayWh)
    : null;

/** Months ('YYYY-MM') with data, newest first. */
export function reportMonths(quarters: readonly Quarter[]): string[] {
  const months = new Set<string>();
  let end = 0;
  for (const { ts } of quarters) {
    // One date per day is enough (quarters in time order).
    if (ts < end) continue;
    months.add(lisbonDate(ts).slice(0, 7));
    end = ts + 3600;
  }
  return [...months].sort().reverse();
}

export function monthlyReport(
  quarters: readonly Quarter[],
  month: string,
  tariff: TariffInput | null,
): MonthlyReport | null {
  const own = quartersOf(quarters, month);
  const usage = monthUsage(own, month);
  if (!usage) return null;
  const previous = monthUsage(quartersOf(quarters, addMonths(month, -1)), addMonths(month, -1));
  const lastYear = monthUsage(quartersOf(quarters, addMonths(month, -12)), addMonths(month, -12));
  const vsPrevious = change(usage, previous);
  const vsLastYear = change(usage, lastYear);

  const byPeriod = tariff ? energyByPeriod(own, tariff) : { simple: usage.totalWh };
  const cost = tariff ? electricityCost(byPeriod, usage.daysWithData, tariff) : null;

  const night = monthlyBaseload(nightlyBaseload(own))[0];
  const annual = night && tariff ? baseloadCost(night.watts, own, tariff) : null;
  const baseload = night
    ? {
        watts: night.watts,
        nights: night.nights,
        cents: annual ? Math.round((annual.annualCents * usage.daysWithData) / 365) : null,
      }
    : null;

  let peak: MonthlyReport['peak'] = null;
  for (const { ts, energyWh } of own) {
    if (!peak || energyWh * 4 > peak.watts) peak = { ts, watts: energyWh * 4 };
  }

  const suggestions: Suggestion[] = [];
  if (baseload && usage.totalWh > 0) {
    // W × 24 h per day with data.
    const pct = Math.round((baseload.watts * 24 * usage.daysWithData * 100) / usage.totalWh);
    if (pct > BASELOAD_SHARE_PCT) {
      suggestions.push({ kind: 'baseload', pct, watts: baseload.watts });
    }
  }
  const share = (wh: Wh | undefined) => Math.round(((wh ?? 0) * 100) / (usage.totalWh || 1));
  if (tariff?.option === 'tri' && share(byPeriod.peak) > PEAK_SHARE_PCT) {
    suggestions.push({ kind: 'peak', pct: share(byPeriod.peak) });
  }
  if (tariff?.option === 'bi' && share(byPeriod.offEmpty) > OFF_EMPTY_SHARE_PCT) {
    suggestions.push({ kind: 'offEmpty', pct: share(byPeriod.offEmpty) });
  }
  if (vsLastYear !== null && vsLastYear > HIGHER_THAN_LAST_YEAR_PCT) {
    suggestions.push({ kind: 'higherThanLastYear', pct: vsLastYear });
  }
  if (tariff && peak && peak.watts * 100 < tariff.powerVa * LOW_PEAK_PCT) {
    suggestions.push({ kind: 'lowPeak', peakWatts: peak.watts, powerVa: tariff.powerVa });
  }
  if (tariff?.option === 'simple') suggestions.push({ kind: 'simpleTariff' });

  return {
    usage,
    previous,
    lastYear,
    vsPrevious,
    vsLastYear,
    byPeriod,
    cost,
    baseload,
    peak,
    suggestions,
  };
}
