// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The named appliances over the last whole days (Phase 8.4): uses, energy and
 * cost of each, added up by name, and the cost of a month like these days
 * (× 365 / 12 / days). Only days with nearly all their minutes count
 * (MIN_DAY_SHARE): a day the Shelly was off would make the month too cheap.
 *
 * Whole programmes (washing machines, dishwashers: `heats`) can run at another
 * hour; for those, what the cheapest period would have saved with the tariff
 * of each day, and their energy in each meter period of both cycles, for
 * "Tarifários" to price them in the empty period of a bi- or tri-hourly offer.
 */
import type { Cycle, MeterPeriod, PeriodsMap } from '../domain/tariff';
import { meterPeriod } from '../domain/time-cycles';
import type { Cents } from '../lib/money';
import type { LocalDate } from '../lib/time';
import type { Wh } from '../lib/units';
import type { NamedTotal } from './day';

/** Whole days looked back over (the per-second cache keeps 14). */
export const RECENT_DAYS = 7;
/** A day counts with at least this share of its minutes. */
export const MIN_DAY_SHARE = 0.9;

export interface RecentDay {
  day: LocalDate;
  /** Minutes with per-second values, and in the day (1380 to 1500). */
  minutes: number;
  dayMinutes: number;
  totals: readonly NamedTotal[];
  /** The day's tariff's map of periods; null without a tariff. */
  periodsMap: PeriodsMap | null;
}

export type CycleEnergy = Record<Cycle, Record<MeterPeriod, Wh>>;

export interface RecentAppliance {
  label: string;
  uses: number;
  energyWh: Wh;
  /** Null when a counted day had no tariff. */
  costCents: Cents | null;
  perMonthCents: Cents | null;
  /** Days it was on. */
  days: number;
  /** It can run at another hour (a whole programme). */
  shiftable: boolean;
  /** What the cheapest period of the tariff would have saved; null when not shiftable or unpriced. */
  savingCents: Cents | null;
  perMonthSavingCents: Cents | null;
  /** Its energy in each meter period; null without a map of periods on some day. */
  periods: CycleEnergy | null;
}

export interface RecentAppliances {
  /** The days counted, oldest first. */
  days: LocalDate[];
  appliances: RecentAppliance[];
}

const key = (label: string) => label.trim().toLocaleLowerCase('pt');

const split = (): Record<MeterPeriod, Wh> => ({ empty: 0, full: 0, peak: 0 });

const perMonth = (cents: Cents | null, days: number) =>
  cents === null || days === 0 ? null : Math.round((cents * 365) / (12 * days));

/** The most expensive first (the most energy when there are no costs). */
export function recentAppliances(days: readonly RecentDay[]): RecentAppliances {
  const counted = days
    .filter((day) => day.minutes >= day.dayMinutes * MIN_DAY_SHARE)
    .sort((a, b) => a.day.localeCompare(b.day));
  const priced = counted.every((day) => day.totals.every((total) => total.costCents !== null));
  const mapped = counted.every((day) => day.periodsMap !== null);
  const byLabel = new Map<string, RecentAppliance>();
  for (const day of counted) {
    for (const total of day.totals) {
      const label = total.appliance.label.trim();
      const item = byLabel.get(key(label)) ?? {
        label,
        uses: 0,
        energyWh: 0,
        costCents: priced ? 0 : null,
        perMonthCents: null,
        days: 0,
        shiftable: false,
        savingCents: null,
        perMonthSavingCents: null,
        periods: mapped ? { daily: split(), weekly: split() } : null,
      };
      // The name as written on the latest day (days run oldest first).
      item.label = label;
      item.uses += total.cycles;
      item.energyWh += total.energyWh;
      if (item.costCents !== null) item.costCents += total.costCents ?? 0;
      if (total.appliance.heats !== null) {
        item.shiftable = true;
        if (priced) item.savingCents = (item.savingCents ?? 0) + (total.savingCents ?? 0);
      }
      if (item.periods && day.periodsMap) {
        for (const { ts, energyWh } of total.quarters) {
          item.periods.daily[meterPeriod(ts, 'daily', day.periodsMap)] += energyWh;
          item.periods.weekly[meterPeriod(ts, 'weekly', day.periodsMap)] += energyWh;
        }
      }
      item.days++;
      byLabel.set(key(label), item);
    }
  }
  const appliances = [...byLabel.values()].map((item) => ({
    ...item,
    perMonthCents: perMonth(item.costCents, counted.length),
    perMonthSavingCents: perMonth(item.savingCents, counted.length),
  }));
  return {
    days: counted.map((day) => day.day),
    appliances: appliances.sort(
      (a, b) => (b.costCents ?? 0) - (a.costCents ?? 0) || b.energyWh - a.energyWh,
    ),
  };
}
