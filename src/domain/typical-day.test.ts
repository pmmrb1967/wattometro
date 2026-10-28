// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { startOfLisbonDay } from '../lib/time';
import { typicalSoFar } from './typical-day';

/** Every quarter of a day up to `hours`, at `wh` each. */
function day(date: string, wh: number, hours = 24) {
  const start = startOfLisbonDay(date);
  return Array.from({ length: hours * 4 }, (_, index) => ({
    ts: start + index * 900,
    energyWh: wh,
  }));
}

// Wednesday 28/10/2026 at 10:07: 40 whole quarters.
const NOW = startOfLisbonDay('2026-10-28') + 10 * 3600 + 7 * 60;

describe('typicalSoFar', () => {
  it('the mean of the same weekdays, up to the same time of day', () => {
    const quarters = [
      ...day('2026-10-21', 100),
      ...day('2026-10-14', 200),
      ...day('2026-10-07', 300),
    ];
    // Up to 10:00: 40 quarters → 4000, 8000, 12000 Wh.
    expect(typicalSoFar(quarters, NOW)).toEqual({ energyWh: 8000, days: 3 });
  });

  it('leaves out other weekdays and days with gaps', () => {
    const quarters = [
      ...day('2026-10-21', 100),
      ...day('2026-10-14', 100),
      ...day('2026-10-07', 100),
      ...day('2026-10-27', 999),
      ...day('2026-09-30', 999, 5),
    ];
    expect(typicalSoFar(quarters, NOW)).toEqual({ energyWh: 4000, days: 3 });
  });

  it('none with fewer than three days, or at midnight', () => {
    expect(typicalSoFar([...day('2026-10-21', 100), ...day('2026-10-14', 100)], NOW)).toBeNull();
    expect(typicalSoFar(day('2026-10-21', 100), startOfLisbonDay('2026-10-28') + 300)).toBeNull();
  });

  it('across the change to winter time (a 25-hour Sunday)', () => {
    // Sunday 1/11 at 10:07; 25/10 had 25 hours: still 40 quarters from midnight (time, not the clock).
    const now = startOfLisbonDay('2026-11-01') + 10 * 3600 + 7 * 60;
    const quarters = [
      ...day('2026-10-25', 100, 25),
      ...day('2026-10-18', 100),
      ...day('2026-10-11', 100),
    ];
    expect(typicalSoFar(quarters, now)).toEqual({ energyWh: 4000, days: 3 });
  });
});
