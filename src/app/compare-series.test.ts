// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { LocalDate } from '../lib/time';
import { compareSeries, daySlots, differencePct, hourTicks } from './compare-series';

const day = (date: LocalDate, wh: number) => daySlots(date).map((ts) => ({ ts, energyWh: wh }));

describe('daySlots and hourTicks', () => {
  it('a day has 96 quarters with a label every 3 hours; the 25 h day 100', () => {
    const slots = daySlots('2026-10-24');
    expect(slots).toHaveLength(96);
    expect(hourTicks(slots).map((tick) => tick.label)).toEqual([
      '0 h',
      '3 h',
      '6 h',
      '9 h',
      '12 h',
      '15 h',
      '18 h',
      '21 h',
    ]);
    expect(hourTicks(slots)[1]?.index).toBe(12);
    const long = daySlots('2026-10-25');
    expect(long).toHaveLength(100);
    // 01:00 happens twice (not a multiple of 3); from 3 h on, 4 slots later.
    expect(hourTicks(long).find((tick) => tick.label === '3 h')?.index).toBe(16);
  });
});

describe('compareSeries', () => {
  it('a day: each quarter of both, compared only where both have it', () => {
    const shelly = day('2026-10-22', 110).slice(48); // from noon
    const { slots, totals, common } = compareSeries(day('2026-10-22', 100), shelly, 'day', [
      '2026-10-22',
    ]);
    expect(slots).toHaveLength(96);
    expect(slots[0]).toMatchObject({ eredes: 100, shelly: null });
    expect(totals).toEqual({ eredes: 9600, shelly: 48 * 110 });
    expect(common).toEqual({ count: 48, eredesWh: 4800, shellyWh: 5280 });
    expect(differencePct(common)).toEqual({ direction: 1, pct: '10,0 %' });
  });

  it('days: totals per day; compared on the days both have whole', () => {
    const eredes = [...day('2026-10-21', 100), ...day('2026-10-22', 100)];
    const shelly = [...day('2026-10-22', 99), ...day('2026-10-23', 99).slice(0, 10)];
    const { slots, common } = compareSeries(eredes, shelly, 'days', [
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
    ]);
    expect(slots.map((slot) => [slot.eredes, slot.shelly])).toEqual([
      [9600, null],
      [9600, 9504],
      [null, 990],
    ]);
    expect(common).toEqual({ count: 1, eredesWh: 9600, shellyWh: 9504 });
    expect(differencePct(common)).toEqual({ direction: -1, pct: '1,0 %' });
  });

  it('nothing to compare without data from both', () => {
    const { common } = compareSeries([], day('2026-10-24', 5), 'day', ['2026-10-24']);
    expect(differencePct(common)).toBeNull();
  });
});
