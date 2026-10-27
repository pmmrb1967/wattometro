// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The named appliances over the last whole days (Phase 8.4): uses, energy and
 * cost of each, added up by name, and the cost of a month like these days
 * (× 365 / 12 / days). Only days with nearly all their minutes count
 * (MIN_DAY_SHARE): a day the Shelly was off would make the month too cheap.
 */
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
}

export interface RecentAppliance {
  label: string;
  uses: number;
  energyWh: Wh;
  /** Null when a counted day had no tariff. */
  costCents: Cents | null;
  perMonthCents: Cents | null;
  /** Days it was on. */
  days: number;
}

export interface RecentAppliances {
  /** The days counted, oldest first. */
  days: LocalDate[];
  appliances: RecentAppliance[];
}

const key = (label: string) => label.trim().toLocaleLowerCase('pt');

/** The most expensive first (the most energy when there are no costs). */
export function recentAppliances(days: readonly RecentDay[]): RecentAppliances {
  const counted = days
    .filter((day) => day.minutes >= day.dayMinutes * MIN_DAY_SHARE)
    .sort((a, b) => a.day.localeCompare(b.day));
  const priced = counted.every((day) => day.totals.every((total) => total.costCents !== null));
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
      };
      // The name as written on the latest day (days run oldest first).
      item.label = label;
      item.uses += total.cycles;
      item.energyWh += total.energyWh;
      if (item.costCents !== null) item.costCents += total.costCents ?? 0;
      item.days++;
      byLabel.set(key(label), item);
    }
  }
  const appliances = [...byLabel.values()].map((item) => ({
    ...item,
    perMonthCents:
      item.costCents === null || counted.length === 0
        ? null
        : Math.round((item.costCents * 365) / (12 * counted.length)),
  }));
  return {
    days: counted.map((day) => day.day),
    appliances: appliances.sort(
      (a, b) => (b.costCents ?? 0) - (a.costCents ?? 0) || b.energyWh - a.energyWh,
    ),
  };
}
