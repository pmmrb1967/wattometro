// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { startOfLisbonDay } from '../lib/time';
import { NO_VALUE, powerDay, slicesMax } from './power-day';

const minute = (ts: number, power: number, nonActive: number | null = 0) => ({
  ts,
  readings: {
    power: new Array<number | null>(60).fill(power),
    nonActive: new Array<number | null>(60).fill(nonActive),
    voltage: new Array<number | null>(60).fill(2300),
  },
});

describe('powerDay', () => {
  it('keeps the apparent power of each second and the peak second', () => {
    const start = startOfLisbonDay('2026-01-15');
    const busy = minute(start + 600, 1000, 0);
    busy.readings.power[30] = 3000;
    busy.readings.nonActive[30] = 4000;
    const day = powerDay([minute(start, 200, null), busy], '2026-01-15');
    expect(day.length).toBe(86_400);
    expect(day.va[0]).toBe(200);
    // √(3000² + 4000²) = 5000.
    expect(day.va[630]).toBe(5000);
    expect(day.va[631]).toBe(1000);
    expect(day.va[660]).toBe(NO_VALUE);
    expect(day.peak).toEqual({ ts: start + 630, va: 5000 });
  });

  it('takes the baseload from the night quarter hours with enough seconds', () => {
    const start = startOfLisbonDay('2026-01-15');
    // 00:00 to 06:00 at 160 W: 24 full quarters.
    const night = Array.from({ length: 360 }, (_, index) => minute(start + index * 60, 160));
    expect(powerDay(night, '2026-01-15').baseloadW).toBe(160);
    // One minute per quarter: too few seconds, no baseload.
    const sparse = night.filter((_, index) => index % 15 === 0);
    expect(powerDay(sparse, '2026-01-15').baseloadW).toBeNull();
  });

  it('has 23 and 25 hours on the days the clocks change', () => {
    expect(powerDay([], '2026-03-29').length).toBe(82_800);
    expect(powerDay([], '2026-10-25').length).toBe(90_000);
  });
});

describe('slicesMax', () => {
  it('keeps the highest value of each slice, null where there is none', () => {
    const va = Int32Array.from([5, 9, NO_VALUE, NO_VALUE, 3, 1, 7, 2]);
    expect(slicesMax(va, 0, 8, 4)).toEqual([9, null, 3, 7]);
    // More slices than seconds: each second on its own.
    expect(slicesMax(va, 4, 6, 4)).toEqual([3, 3, 1, 1]);
  });
});
