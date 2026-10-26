// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { pairCycles, type Cycle } from './cycles';
import { boundCycleEnergy, overlapCappedWh } from './energy';
import { detectEvents } from './events';
import type { SecondsSeries } from './series';

const START = 1_790_000_000;

function series(power: number[]): SecondsSeries {
  return {
    start: START,
    power: Int32Array.from(power),
    nonActive: Int32Array.from(power.map(() => 50)),
    voltage: Int32Array.from(power.map(() => 2300)),
  };
}

const flat = (seconds: number, watts: number) => Array.from({ length: seconds }, () => watts);

// A 100 W appliance for 300 s: 100 × 300 / 3600 = 8,3 Wh.
const power = [...flat(60, 200), ...flat(300, 300), ...flat(600, 200)];
const day = series(power);
const [cycle] = pairCycles(detectEvents(day)) as [Cycle];

describe('boundCycleEnergy', () => {
  it('keeps a right cycle as it is', () => {
    expect(cycle).toMatchObject({ durationS: 300, energyWh: 8 });
    expect(boundCycleEnergy([cycle], day)).toEqual([cycle]);
  });

  it('counts only what was drawn when the off was paired too late', () => {
    // As if the off had been missed and a later one taken: 900 s, 25 Wh.
    const late = { ...cycle, end: cycle.start + 900, durationS: 900, energyWh: 25 };
    expect(boundCycleEnergy([late], day)[0]).toMatchObject({ durationS: 900, energyWh: 8 });
  });

  it('never counts more than the cycle’s power, whatever else switched on', () => {
    // A 2 kW kettle during the 100 W cycle.
    const busy = series([
      ...flat(60, 200),
      ...flat(100, 300),
      ...flat(100, 2300),
      ...flat(100, 300),
      ...flat(600, 200),
    ]);
    const long = { ...cycle, energyWh: 99 };
    expect(boundCycleEnergy([long], busy)[0]!.energyWh).toBe(8);
  });

  it('leaves pulsing uses alone (two plates draw twice one)', () => {
    const pulsing = { ...cycle, energyWh: 25, pulses: { count: 3, onS: 900 } };
    expect(boundCycleEnergy([pulsing], day)[0]!.energyWh).toBe(25);
  });
});

describe('overlapCappedWh', () => {
  it('counts each second once for overlapping cycles of one appliance', () => {
    // Two cycles of 300 s overlapping by 200 s: 400 s covered, 100 × 400 / 3600 = 11 Wh.
    const other = { ...cycle, start: cycle.start + 100, end: cycle.end + 100 };
    expect(overlapCappedWh([cycle, other], 100)).toBe(11);
    // Apart, nothing to cap: 8 + 8.
    const apart = { ...cycle, start: cycle.start + 400, end: cycle.end + 400 };
    expect(overlapCappedWh([cycle, apart], 100)).toBe(16);
  });
});
