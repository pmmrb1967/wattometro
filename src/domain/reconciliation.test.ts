// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { dayMinutes, reconcile, type DayEnergy } from './reconciliation';

describe('dayMinutes', () => {
  it('is 1440, and 1500 / 1380 when the clocks change', () => {
    expect(dayMinutes('2026-10-24')).toBe(1440);
    expect(dayMinutes('2026-10-25')).toBe(1500);
    expect(dayMinutes('2026-03-29')).toBe(1380);
  });
});

describe('reconcile', () => {
  it('compares only the days both have whole, as a share of E-Redes', () => {
    const eredes: DayEnergy[] = [
      ['2026-10-23', 10_000, null],
      ['2026-10-24', 8_000, null],
      ['2026-10-25', 9_000, null],
      ['2026-10-26', 7_000, null],
    ];
    const shelly: DayEnergy[] = [
      ['2026-10-24', 8_160, 1440], // +2.0 %
      ['2026-10-25', 4_000, 1376], // the clock-change gap: left out
      ['2026-10-26', 7_210, 1440], // +3.0 %
      ['2026-10-27', 9_999, 1440], // no E-Redes yet
    ];
    const result = reconcile(eredes, shelly);
    expect(result.days.map((day) => [day.date, day.tenths])).toEqual([
      ['2026-10-24', 20],
      ['2026-10-26', 30],
    ]);
    expect(result).toMatchObject({ eredesWh: 15_000, shellyWh: 15_370, incomplete: 1 });
    // 370 / 15 000 = 2.47 % → 25 tenths.
    expect(result.tenths).toBe(25);
    expect(result.unusual).toEqual([]);
  });

  it('sets apart the days far from the overall difference', () => {
    const dates = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'];
    const eredes: DayEnergy[] = dates.map((date) => [date, 10_000, null]);
    const shelly: DayEnergy[] = dates.map((date, i) => [date, i === 2 ? 9_000 : 10_200, 1440]);
    const result = reconcile(eredes, shelly);
    // 39 600 / 40 000 → −1.0 %; the 4th of November (−10 %) is 9 points off.
    expect(result.tenths).toBe(-10);
    expect(result.unusual.map((day) => day.date)).toEqual(['2026-11-04']);
  });

  it('has nothing to say without days in common', () => {
    const result = reconcile([['2026-10-20', 9_000, null]], [['2026-10-25', 9_000, 1500]]);
    expect(result).toMatchObject({ days: [], tenths: null, incomplete: 0, unusual: [] });
  });
});
