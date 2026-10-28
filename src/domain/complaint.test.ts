// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { complaintGrounds } from './complaint';
import type { VoltageEpisode, WeekCompliance, YearSummary } from './voltage';

const week = (
  date: string,
  outsideBand: number,
  outsideLimits = 0,
  evaluated = 1008,
): WeekCompliance => ({
  week: date,
  expected: 1008,
  evaluated,
  excluded: 1008 - evaluated,
  outsideBand,
  outsideLimits,
  meetsBand: outsideBand * 100 <= 5 * evaluated,
  meetsLimits: outsideLimits === 0,
});

const within: YearSummary = {
  year: 2026,
  longCount: 2,
  longSeconds: 1200,
  shortCount: 0,
  excludedCount: 0,
  standard: { interruptions: 10, hours: 6 },
  overCount: false,
  overHours: false,
};

const episode = (kind: 'low' | 'high', extremeDv: number, start: number): VoltageEpisode => ({
  kind,
  start,
  end: start + 60,
  minutes: 1,
  extremeDv,
});

describe('complaintGrounds', () => {
  it('nothing to complain about: every week meets the standard, outages within it', () => {
    expect(
      complaintGrounds(
        [[week('2026-10-05', 50), week('2026-10-12', 0)]],
        [episode('high', 2540, 1)],
        within,
      ),
    ).toBeNull();
  });

  it('failing weeks, once each with the worse meter, and the extreme minutes', () => {
    const grounds = complaintGrounds(
      [
        [week('2026-10-12', 60), week('2026-10-05', 51)],
        [week('2026-10-12', 80), week('2026-10-19', 10, 2)],
      ],
      [episode('high', 2560, 10), episode('high', 2610, 20), episode('low', 2040, 30)],
      within,
    );
    expect(grounds).toEqual({
      weeks: [
        { week: '2026-10-05', evaluated: 1008, outsideBand: 51, outsideLimits: 0 },
        { week: '2026-10-12', evaluated: 1008, outsideBand: 80, outsideLimits: 0 },
        { week: '2026-10-19', evaluated: 1008, outsideBand: 10, outsideLimits: 2 },
      ],
      low: { count: 1, extremeDv: 2040, at: 30 },
      high: { count: 2, extremeDv: 2610, at: 20 },
      outages: null,
    });
  });

  it('outages over the standard are grounds on their own', () => {
    const over = { ...within, longCount: 12, overCount: true };
    expect(complaintGrounds([], [], over)).toEqual({
      weeks: [],
      low: null,
      high: null,
      outages: over,
    });
  });
});
