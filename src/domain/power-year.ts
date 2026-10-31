// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * "Potência" over the last year, month by month (docs/contracted-power.md):
 * the highest one-second power the Shelly saw (from its daily peaks), and the
 * highest average power of a quarter hour (energy × 4) from E-Redes or the
 * Shelly. A quarter's average hides the short peaks that trip the meter, so it
 * never says a tier is safe; but a month without the Shelly whose quarters
 * went well above those of the measured months probably had higher peaks too.
 */
import { lisbonDate, type EpochSeconds, type LocalDate } from '../lib/time';
import type { Wh } from '../lib/units';

type Quarter = { ts: EpochSeconds; energyWh: Wh };

export interface DayPeak {
  day: LocalDate;
  /** Highest one-second power: apparent (VA) where known, else active (W). */
  peak: number;
  /** Some minute had no apparent peak (active power used instead). */
  estimated: boolean;
}

export interface MonthPeaks {
  /** 'YYYY-MM'. */
  month: string;
  /** The Shelly's highest one-second power; null without its days. */
  shelly: { peak: number; estimated: boolean } | null;
  /** Highest quarter-hour average from E-Redes, W; null without its quarters. */
  eredesW: number | null;
  /** Highest quarter-hour average from either, W; null without any. */
  quarterW: number | null;
}

/** A quarter hour's energy as its average power. */
const quarterAverageW = (wh: Wh) => wh * 4;

const monthOf = (ts: EpochSeconds) => lisbonDate(ts).slice(0, 7);

export function monthPeaks(
  months: readonly string[],
  days: readonly DayPeak[],
  eredes: readonly Quarter[],
  shelly: readonly Quarter[],
): MonthPeaks[] {
  const rows = new Map<string, MonthPeaks>(
    months.map((month) => [month, { month, shelly: null, eredesW: null, quarterW: null }]),
  );
  for (const { day, peak, estimated } of days) {
    const row = rows.get(day.slice(0, 7));
    if (!row) continue;
    if (!row.shelly || peak > row.shelly.peak) {
      row.shelly = { peak, estimated: estimated || (row.shelly?.estimated ?? false) };
    } else if (estimated) row.shelly.estimated = true;
  }
  for (const [quarters, isEredes] of [
    [eredes, true],
    [shelly, false],
  ] as const) {
    for (const { ts, energyWh } of quarters) {
      const row = rows.get(monthOf(ts));
      if (!row) continue;
      const watts = quarterAverageW(energyWh);
      if (isEredes) row.eredesW = Math.max(row.eredesW ?? 0, watts);
      row.quarterW = Math.max(row.quarterW ?? 0, watts);
    }
  }
  return [...rows.values()];
}

/** How far above the measured months a month's highest quarter has to be to warn, %. */
export const SEASON_MARGIN_PCT = 10;

export interface SeasonWarning {
  month: string;
  /** That month's highest quarter-hour average (E-Redes), W. */
  eredesW: number;
  /** The highest quarter-hour average of the months the Shelly measured, W. */
  measuredW: number;
}

/**
 * The month without the Shelly whose highest quarter hour (E-Redes) is the
 * furthest above those of the months the Shelly measured, when it is at least
 * SEASON_MARGIN_PCT above them; null otherwise (or without both).
 */
export function seasonWarning(rows: readonly MonthPeaks[]): SeasonWarning | null {
  const measured = rows.filter((row) => row.shelly !== null && row.quarterW !== null);
  if (measured.length === 0) return null;
  const measuredW = Math.max(...measured.map((row) => row.quarterW as number));
  let worst: SeasonWarning | null = null;
  for (const row of rows) {
    if (row.shelly !== null || row.eredesW === null) continue;
    if (row.eredesW * 100 < measuredW * (100 + SEASON_MARGIN_PCT)) continue;
    if (!worst || row.eredesW > worst.eredesW) {
      worst = { month: row.month, eredesW: row.eredesW, measuredW };
    }
  }
  return worst;
}
