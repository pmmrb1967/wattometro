// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * One Lisbon day of a meter's power, from its per-second values, for the
 * chart on the Potência page: the apparent power of each second (what the
 * meter compares with the contracted power), the day's peak and the night's
 * baseload (src/domain/baseload.ts, from the quarter hours made of the
 * seconds).
 */
import { SECONDS_PER_MINUTE, type SecondReadings } from '../lib/readings-1s';
import {
  lisbonDayLength,
  QUARTER_HOUR,
  startOfLisbonDay,
  type EpochSeconds,
  type LocalDate,
} from '../lib/time';
import type { Watts } from '../lib/units';
import { nightlyBaseload } from './baseload';

/** A quarter hour counts for the baseload with at least this share of its seconds. */
const MIN_QUARTER_SHARE = 0.8;
/** A second without a value. */
export const NO_VALUE = -1;

export interface PowerDay {
  start: EpochSeconds;
  /** Seconds in the day (82 800, 86 400 or 90 000). */
  length: number;
  /** Apparent power of each second of the day, VA; NO_VALUE without one. */
  va: Int32Array;
  peak: { ts: EpochSeconds; va: number } | null;
  /** Null when the night has too few quarter hours. */
  baseloadW: Watts | null;
}

export function powerDay(
  minutes: readonly { ts: EpochSeconds; readings: SecondReadings }[],
  day: LocalDate,
): PowerDay {
  const start = startOfLisbonDay(day);
  const length = lisbonDayLength(day);
  const va = new Int32Array(length).fill(NO_VALUE);
  const quarters = new Map<EpochSeconds, { joules: number; seconds: number }>();
  let peak: PowerDay['peak'] = null;

  for (const { ts, readings } of minutes) {
    const offset = ts - start;
    if (offset < 0 || offset >= length || offset % SECONDS_PER_MINUTE !== 0) continue;
    const quarterTs = ts - (offset % QUARTER_HOUR);
    const quarter = quarters.get(quarterTs) ?? { joules: 0, seconds: 0 };
    for (let second = 0; second < SECONDS_PER_MINUTE; second++) {
      const p = readings.power[second];
      if (p === null || p === undefined) continue;
      const q = readings.nonActive[second] ?? null;
      const apparent = q === null ? Math.abs(p) : Math.round(Math.hypot(p, q));
      va[offset + second] = apparent;
      if (!peak || apparent > peak.va) peak = { ts: ts + second, va: apparent };
      quarter.joules += Math.max(p, 0);
      quarter.seconds += 1;
    }
    quarters.set(quarterTs, quarter);
  }

  const full = [...quarters]
    .filter(([, quarter]) => quarter.seconds >= QUARTER_HOUR * MIN_QUARTER_SHARE)
    .map(([ts, quarter]) => ({
      ts,
      // The average power over the quarter, as Wh in 15 minutes (W ÷ 4).
      energyWh: Math.round(quarter.joules / quarter.seconds / 4),
    }));
  const night = nightlyBaseload(full)[0];
  return { start, length, va, peak, baseloadW: night ? night.watts : null };
}

/**
 * The highest value of each of `count` equal slices of the seconds [from, to)
 * of the day (one point per slice of the chart), null for a slice without
 * values.
 */
export function slicesMax(
  va: Int32Array,
  from: number,
  to: number,
  count: number,
): (number | null)[] {
  const slices: (number | null)[] = [];
  const size = (to - from) / count;
  for (let index = 0; index < count; index++) {
    const first = Math.floor(from + index * size);
    const last = Math.max(first + 1, Math.floor(from + (index + 1) * size));
    let max = NO_VALUE;
    for (let second = first; second < last && second < va.length; second++) {
      max = Math.max(max, va[second] ?? NO_VALUE);
    }
    slices.push(max === NO_VALUE ? null : max);
  }
  return slices;
}
