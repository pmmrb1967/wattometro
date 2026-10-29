// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * One Lisbon day of a meter's power, from its per-second values, for the
 * chart on the Potência page: the highest apparent power of each minute (what
 * the meter compares with the contracted power), the day's peak and the
 * night's baseload (src/domain/baseload.ts, from the quarter hours made of the
 * seconds).
 */
import { SECONDS_PER_MINUTE, type SecondReadings } from '../lib/readings-1s';
import {
  lisbonDayLength,
  MINUTE,
  QUARTER_HOUR,
  startOfLisbonDay,
  type EpochSeconds,
  type LocalDate,
} from '../lib/time';
import type { Watts } from '../lib/units';
import { nightlyBaseload } from './baseload';

/** A quarter hour counts for the baseload with at least this share of its seconds. */
const MIN_QUARTER_SHARE = 0.8;

export interface PowerDay {
  start: EpochSeconds;
  /** Minutes in the day (1380, 1440 or 1500). */
  length: number;
  /** Highest apparent power of each minute, VA; null without per-second values. */
  maxVa: (number | null)[];
  peak: { ts: EpochSeconds; va: number } | null;
  /** Null when the night has too few quarter hours. */
  baseloadW: Watts | null;
}

export function powerDay(
  minutes: readonly { ts: EpochSeconds; readings: SecondReadings }[],
  day: LocalDate,
): PowerDay {
  const start = startOfLisbonDay(day);
  const length = lisbonDayLength(day) / MINUTE;
  const maxVa: (number | null)[] = new Array<number | null>(length).fill(null);
  const quarters = new Map<EpochSeconds, { joules: number; seconds: number }>();
  let peak: PowerDay['peak'] = null;

  for (const { ts, readings } of minutes) {
    const index = (ts - start) / MINUTE;
    if (!Number.isInteger(index) || index < 0 || index >= length) continue;
    const quarterTs = ts - ((ts - start) % QUARTER_HOUR);
    const quarter = quarters.get(quarterTs) ?? { joules: 0, seconds: 0 };
    for (let second = 0; second < SECONDS_PER_MINUTE; second++) {
      const p = readings.power[second];
      if (p === null || p === undefined) continue;
      const q = readings.nonActive[second] ?? null;
      const va = q === null ? Math.abs(p) : Math.round(Math.hypot(p, q));
      maxVa[index] = Math.max(maxVa[index] ?? 0, va);
      if (!peak || va > peak.va) peak = { ts: ts + second, va };
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
  return { start, length, maxVa, peak, baseloadW: night ? night.watts : null };
}
