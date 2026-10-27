// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The Shelly against E-Redes on the days both measured whole: E-Redes is the
 * billing reference, so the difference is the Shelly's, as a share of E-Redes.
 * A day counts only with every minute of its Lisbon day (1440, or 1380 and
 * 1500 when the clocks change) on both sides: a day the Shelly missed minutes,
 * or an E-Redes export that ends early in the day (26/10/2026: 2 quarter
 * hours, which made the Shelly measure "2686 % more"), would distort it.
 * From the daily totals (GET /v1/energy/days): integer Wh, a ratio only at the end.
 */
import { nextDate, startOfLisbonDay, type LocalDate } from '../lib/time';

/** [date, Wh, minutes with data (E-Redes: its quarter hours × 15) or null when unknown] */
export type DayEnergy = readonly [LocalDate, number, number | null];

/** A day this far (in tenths of a percentage point) from the overall difference is shown apart. */
export const UNUSUAL_TENTHS = 30;

export interface ReconciledDay {
  date: LocalDate;
  eredesWh: number;
  shellyWh: number;
  /** (Shelly − E-Redes) / E-Redes, in tenths of a percent (21 = 2.1 %). */
  tenths: number;
}

export interface Reconciliation {
  /** The days both have whole, oldest first. */
  days: ReconciledDay[];
  eredesWh: number;
  shellyWh: number;
  /** Over all those days; null without any (or with E-Redes at zero). */
  tenths: number | null;
  /** Days both have, left out because one of them is not whole. */
  incomplete: number;
  /** Days far from the overall difference (UNUSUAL_TENTHS), largest first. */
  unusual: ReconciledDay[];
}

const tenthsOf = (shellyWh: number, eredesWh: number) =>
  Math.round(((shellyWh - eredesWh) * 1000) / eredesWh);

/** Minutes of a Lisbon day: 1440, or 1380 / 1500 on the days the clocks change. */
export function dayMinutes(date: LocalDate): number {
  return (startOfLisbonDay(nextDate(date)) - startOfLisbonDay(date)) / 60;
}

export function reconcile(
  eredes: readonly DayEnergy[],
  shelly: readonly DayEnergy[],
): Reconciliation {
  const ofShelly = new Map(shelly.map(([date, wh, minutes]) => [date, { wh, minutes }]));
  const days: ReconciledDay[] = [];
  let incomplete = 0;
  for (const [date, eredesWh, eredesMinutes] of eredes) {
    const day = ofShelly.get(date);
    if (!day) continue;
    const eredesWhole = eredesMinutes === null || eredesMinutes === dayMinutes(date);
    if (day.minutes !== dayMinutes(date) || !eredesWhole || eredesWh <= 0) {
      incomplete += 1;
      continue;
    }
    days.push({ date, eredesWh, shellyWh: day.wh, tenths: tenthsOf(day.wh, eredesWh) });
  }
  const eredesWh = days.reduce((sum, day) => sum + day.eredesWh, 0);
  const shellyWh = days.reduce((sum, day) => sum + day.shellyWh, 0);
  const tenths = eredesWh > 0 ? tenthsOf(shellyWh, eredesWh) : null;
  const unusual =
    tenths === null
      ? []
      : days
          .filter((day) => Math.abs(day.tenths - tenths) > UNUSUAL_TENTHS)
          .sort((a, b) => Math.abs(b.tenths - tenths) - Math.abs(a.tenths - tenths));
  return { days, eredesWh, shellyWh, tenths, incomplete, unusual };
}
