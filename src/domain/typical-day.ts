// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Today so far against a usual day: the energy up to the same time of day on
 * the same weekday of the weeks before (the "Início" card). Quarters are
 * marked by their start (src/lib/time.ts).
 */
import { lisbonDate, startOfLisbonDay, type EpochSeconds } from '../lib/time';
import type { Wh } from '../lib/units';
import { addDays } from './consumption';

export const TYPICAL_WEEKS = 8;
/** Fewer days than this and "usual" means little. */
export const TYPICAL_MIN_DAYS = 3;
/** A day counts when this share of its quarters so far is there. */
const COVERAGE_PCT = 90;
const QUARTER = 900;

export interface TypicalSoFar {
  /** Mean energy up to this time of day over the days that count. */
  energyWh: Wh;
  days: number;
}

/**
 * The mean energy, on the last TYPICAL_WEEKS same weekdays, from midnight to
 * the time of day of `now` (whole quarters only). Null with fewer than
 * TYPICAL_MIN_DAYS complete enough, or before the first quarter of the day ends.
 */
export function typicalSoFar(
  quarters: readonly { ts: EpochSeconds; energyWh: Wh }[],
  now: EpochSeconds,
): TypicalSoFar | null {
  const today = lisbonDate(now);
  const elapsed = Math.floor((now - startOfLisbonDay(today)) / QUARTER) * QUARTER;
  if (elapsed <= 0) return null;
  const expected = elapsed / QUARTER;
  const totals: Wh[] = [];
  for (let week = 1; week <= TYPICAL_WEEKS; week++) {
    const start = startOfLisbonDay(addDays(today, -7 * week));
    const end = start + elapsed;
    let energy = 0;
    let count = 0;
    for (const quarter of quarters) {
      if (quarter.ts >= start && quarter.ts < end) {
        energy += quarter.energyWh;
        count += 1;
      }
    }
    if (count * 100 >= expected * COVERAGE_PCT) totals.push(energy);
  }
  if (totals.length < TYPICAL_MIN_DAYS) return null;
  const sum = totals.reduce((total, wh) => total + wh, 0);
  return { energyWh: Math.round(sum / totals.length), days: totals.length };
}
