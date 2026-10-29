// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Gaps in the imported E-Redes data (Settings → E-Redes consumption): days
 * missing between the first and the last imported, days with fewer quarter
 * hours than they should have, and the days E-Redes estimated. From the
 * daily totals the server keeps (quarters and estimated per day).
 *
 * A day has 96 quarter hours, 92 when the clocks go forward. On the day they
 * go back (25 h) the export has only 96, never the repeated hour
 * (docs/eredes-csv.md): 96 is whole for that day.
 */
import { lisbonDayLength, nextDate, QUARTER_HOUR, type LocalDate } from '../lib/time';

/** [Lisbon day, its quarter hours, how many E-Redes estimated]; null when not counted. */
export type EredesDay = [day: LocalDate, quarters: number | null, estimated: number | null];

export interface DayRange {
  from: LocalDate;
  to: LocalDate;
  days: number;
}

export interface EredesCoverage {
  /** Runs of days with no data, between the first and the last day imported. */
  missing: DayRange[];
  /** Days with some quarter hours, not all; how many are missing. */
  partial: { day: LocalDate; missingQuarters: number }[];
  /** Days with quarter hours E-Redes estimated, and how many. */
  estimated: { day: LocalDate; quarters: number }[];
}

/** The quarter hours a whole day has in the export. */
export function expectedQuarters(day: LocalDate): number {
  return Math.min(lisbonDayLength(day) / QUARTER_HOUR, 96);
}

/** The gaps of the imported days (in any order). */
export function eredesCoverage(days: readonly EredesDay[]): EredesCoverage {
  const sorted = [...days].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const coverage: EredesCoverage = { missing: [], partial: [], estimated: [] };
  let previous: LocalDate | null = null;
  for (const [day, quarters, estimated] of sorted) {
    if (previous !== null) {
      let gap = nextDate(previous);
      if (gap < day) {
        const range: DayRange = { from: gap, to: gap, days: 0 };
        while (gap < day) {
          range.to = gap;
          range.days++;
          gap = nextDate(gap);
        }
        coverage.missing.push(range);
      }
    }
    previous = day;
    if (quarters !== null && quarters < expectedQuarters(day)) {
      coverage.partial.push({ day, missingQuarters: expectedQuarters(day) - quarters });
    }
    if (estimated) coverage.estimated.push({ day, quarters: estimated });
  }
  return coverage;
}
