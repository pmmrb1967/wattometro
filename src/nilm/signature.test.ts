// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { SecondReadings } from '../lib/readings-1s';
import type { MinuteSeconds } from './series';
import { signatureCycle } from './signature';

const START = 1_790_000_040 - (1_790_000_040 % 60);

/** Minutes from per-second power (W), 50 var and 230,0 V throughout. */
function minutes(power: number[]): MinuteSeconds[] {
  const list: MinuteSeconds[] = [];
  for (let offset = 0; offset < power.length; offset += 60) {
    const chunk = power.slice(offset, offset + 60);
    const readings: SecondReadings = {
      power: chunk,
      nonActive: chunk.map(() => 50),
      voltage: chunk.map(() => 2300),
    };
    list.push({ ts: START + offset, readings });
  }
  return list;
}

const flat = (seconds: number, watts: number) => Array.from({ length: seconds }, () => watts);

describe('signatureCycle', () => {
  it('finds the appliance switched on and off in the marked run', () => {
    // A kettle (2000 W) from 1:30 to 4:00, marked from 1:40 (clicked late) to 4:10.
    const power = [...flat(90, 160), ...flat(150, 2160), ...flat(120, 160)];
    const cycle = signatureCycle(minutes(power), START + 100, START + 250);
    expect(cycle).toMatchObject({ start: START + 90, durationS: 150, powerW: 2000, energyWh: 83 });
  });

  it('prefers it to the fridge cycling meanwhile', () => {
    // Fridge (100 W) 0:20–5:00; the kettle (2000 W) only 2:00–3:00 but that is what was marked.
    const power = [
      ...flat(20, 160),
      ...flat(100, 260),
      ...flat(60, 2260),
      ...flat(120, 260),
      ...flat(60, 160),
    ];
    const cycle = signatureCycle(minutes(power), START + 120, START + 180);
    expect(cycle).toMatchObject({ start: START + 120, powerW: 2000 });
  });

  it('is null without a cycle', () => {
    expect(signatureCycle(minutes(flat(180, 160)), START + 60, START + 120)).toBeNull();
    expect(signatureCycle([], START, START + 60)).toBeNull();
  });
});
