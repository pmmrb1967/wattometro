// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { Appliance } from './appliances';
import { apparentWithout, breakdownAt, peakSecond, switchOff } from './at-peak';
import type { SecondsSeries } from './series';

const START = 1_793_000_000;

/** Seconds at 230 V with these loads (W, no non-active power) on [from, to) of the series. */
function series(length: number, loads: { w: number; from: number; to: number }[]): SecondsSeries {
  const power = new Int32Array(length).fill(300);
  for (const load of loads) {
    for (let slot = load.from; slot < Math.min(load.to, length); slot++) {
      power[slot] = (power[slot] as number) + load.w;
    }
  }
  return {
    start: START,
    power,
    nonActive: new Int32Array(length),
    voltage: new Int32Array(length).fill(2300),
  };
}

const appliance = (id: string, label: string, powerW: number): Appliance => ({
  id,
  label,
  powerW,
  statesW: [powerW],
  pulsing: false,
  minDurationS: null,
  maxDurationS: null,
  heats: null,
});

const APPLIANCES = [
  appliance('a', 'Forno', 2000),
  appliance('b', 'Máquina de lavar roupa', 1800),
  appliance('c', 'Máquina de lavar loiça', 1810),
];

describe('what was on at a peak', () => {
  // Oven on from 600 s and still on; something of 1800 W from 3000 s to 4000 s;
  // 1500 W of nothing named from 3200 s, still on; a 100 W lamp (left in the rest).
  const seconds = series(4_200, [
    { w: 2000, from: 600, to: 99_999 },
    { w: 1800, from: 3000, to: 4000 },
    { w: 1500, from: 3200, to: 99_999 },
    { w: 100, from: 3300, to: 99_999 },
  ]);

  it('finds the peak second and the appliances on then, largest first', () => {
    // 300 + 2000 + 1800 + 1500 + 100 = 5700 W from 3300 s to 4000 s: its first second.
    const peak = peakSecond(seconds, START, START + 4_200);
    expect(peak).toBe(START + 3_300);
    const breakdown = breakdownAt(seconds, START + 3_500, APPLIANCES);
    expect(breakdown).toMatchObject({ powerW: 5_700, apparentVa: 5_700, restW: 400 });
    expect(breakdown?.loads).toEqual([
      { labels: ['Forno'], powerW: 2000, nonActiveVar: 0, since: START + 600 },
      // Closed: its whole cycle names it, and the dishwasher (10 W away) does not.
      { labels: ['Máquina de lavar roupa'], powerW: 1800, nonActiveVar: 0, since: START + 3000 },
      { labels: [], powerW: 1500, nonActiveVar: 0, since: START + 3200 },
    ]);
  });

  it('names a step still on by power alone: both when two fit, the nearest first', () => {
    const running = series(3_600, [{ w: 1808, from: 1000, to: 99_999 }]);
    expect(breakdownAt(running, START + 3_000, APPLIANCES)?.loads[0]?.labels).toEqual([
      'Máquina de lavar loiça',
      'Máquina de lavar roupa',
    ]);
  });

  it('says what to switch off to be below a limit', () => {
    const breakdown = breakdownAt(seconds, START + 3_500, APPLIANCES);
    if (!breakdown) throw new Error('no breakdown');
    // 5700 → 4600: 1500 W is enough alone, the smallest that is.
    expect(switchOff(breakdown, 4_600)).toMatchObject({
      loads: [{ powerW: 1500 }],
      apparentVa: 4_200,
    });
    // 5700 → 3450: none alone (2000 leaves 3700); the oven and the washing machine.
    expect(switchOff(breakdown, 3_450)?.loads.map((load) => load.powerW)).toEqual([2000, 1800]);
    expect(switchOff(breakdown, 6_900)).toBeNull();
    // Below what three loads explain: nothing to say.
    expect(switchOff(breakdown, 300)).toBeNull();
    expect(apparentWithout(breakdown, breakdown.loads)).toBe(400);
  });

  it('says nothing for a missing second', () => {
    const gap = series(600, []);
    gap.power[10] = -32768;
    expect(breakdownAt(gap, START + 10, APPLIANCES)).toBeNull();
    expect(breakdownAt(gap, START + 5_000, APPLIANCES)).toBeNull();
  });
});
