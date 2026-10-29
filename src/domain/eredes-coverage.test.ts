// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { eredesCoverage, expectedQuarters } from './eredes-coverage';

describe('expectedQuarters', () => {
  it('is 96, 92 when the clocks go forward, and 96 on the day of 25 h', () => {
    expect(expectedQuarters('2026-01-15')).toBe(96);
    expect(expectedQuarters('2026-03-29')).toBe(92);
    // 100 quarter hours long, but the export never has the repeated hour.
    expect(expectedQuarters('2025-10-26')).toBe(96);
  });
});

describe('eredesCoverage', () => {
  it('finds nothing when every day is whole and real', () => {
    expect(
      eredesCoverage([
        ['2026-03-28', 96, 0],
        ['2026-03-29', 92, 0],
        ['2026-03-30', 96, 0],
      ]),
    ).toEqual({ missing: [], partial: [], estimated: [] });
  });

  it('groups the missing days into runs, across a month', () => {
    const coverage = eredesCoverage([
      ['2026-01-30', 96, 0],
      ['2026-02-03', 96, 0],
      ['2026-02-05', 96, 0],
    ]);
    expect(coverage.missing).toEqual([
      { from: '2026-01-31', to: '2026-02-02', days: 3 },
      { from: '2026-02-04', to: '2026-02-04', days: 1 },
    ]);
  });

  it('counts the quarter hours missing in a day and the estimated ones, in any order', () => {
    const coverage = eredesCoverage([
      ['2026-03-29', 88, 0],
      ['2026-01-15', 96, 3],
      ['2026-01-16', 90, null],
      ['2026-01-17', null, null],
    ]);
    expect(coverage.partial).toEqual([
      { day: '2026-01-16', missingQuarters: 6 },
      { day: '2026-03-29', missingQuarters: 4 },
    ]);
    expect(coverage.estimated).toEqual([{ day: '2026-01-15', quarters: 3 }]);
    // Between 17/01 and 29/03: 70 days with nothing.
    expect(coverage.missing).toEqual([{ from: '2026-01-18', to: '2026-03-28', days: 70 }]);
  });
});
