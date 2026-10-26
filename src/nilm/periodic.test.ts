// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { generateDemo } from '../demo/model';
import { startOfLisbonDay } from '../lib/time';
import { pairCycles } from './cycles';
import { detectEvents } from './events';
import { mergePulses } from './periodic';
import { toSeries, type SecondsSeries } from './series';
import { groupCycles } from './summary';

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
/** `count` pulses of `watts` above `base`: `on` seconds on, `off` seconds off. */
const pulses = (count: number, on: number, off: number, watts: number, base: number) =>
  Array.from({ length: count }, () => [...flat(on, base + watts), ...flat(off, base)]).flat();

const cyclesOf = (power: number[]) => {
  const s = series(power);
  return mergePulses(pairCycles(detectEvents(s)), s);
};

describe('mergePulses', () => {
  it('makes an induction hob pulsing one use', () => {
    // 12 pulses of 2000 W, 10 s on and 10 s off: 2000 × 120 / 3600 = 66,7 Wh.
    const cycles = cyclesOf([...flat(60, 160), ...pulses(12, 10, 10, 2000, 160), ...flat(60, 160)]);
    expect(cycles).toHaveLength(1);
    expect(cycles[0]).toMatchObject({
      start: START + 60,
      // The last pulse ends 10 s before the run of 240 s does.
      durationS: 230,
      powerW: 2000,
      energyWh: 67,
      pulses: { count: 12, onS: 120 },
    });
  });

  it('keeps the fridge apart while the hob pulses', () => {
    // Fridge (100 W) from 0:30 to 4:30; the hob pulses (1500 W, 8 s on, 12 s off) from 1:00.
    const power = [
      ...flat(30, 160),
      ...flat(30, 260),
      ...pulses(9, 8, 12, 1500, 260),
      ...flat(30, 260),
      ...flat(30, 160),
    ];
    const cycles = cyclesOf(power);
    expect(cycles.map((cycle) => [cycle.powerW, cycle.pulses?.count ?? 1])).toEqual([
      [100, 1],
      [1500, 9],
    ]);
  });

  it('leaves alone cycles too few, too far apart or too long', () => {
    // Two kettles a minute apart: only two.
    expect(
      cyclesOf([...flat(30, 160), ...pulses(2, 60, 60, 2000, 160)]).map((c) => c.pulses),
    ).toEqual([undefined, undefined]);
    // Three, but three minutes apart.
    expect(cyclesOf([...flat(30, 160), ...pulses(3, 20, 180, 2000, 160)])).toHaveLength(3);
    // Three of 10 minutes each (an oven, not pulses).
    expect(cyclesOf([...flat(30, 160), ...pulses(3, 600, 60, 2400, 160)])).toHaveLength(3);
  });

  it('makes two plates pulsing at once one use, with most of the energy of both', () => {
    // Plate A: 1200 W, 30 s on and 14 s off; plate B: 1200 W, 13 s on and 9 s off, from 0:25.
    // They never switch in the same second, but often within 3 s (no steady state between).
    const power = Array.from({ length: 600 }, (_, second) => {
      const a = second % 44 < 30 ? 1200 : 0;
      const b = second >= 25 && (second - 25) % 22 < 13 ? 1200 : 0;
      return 240 + a + b;
    });
    const cycles = cyclesOf([...flat(60, 240), ...power, ...flat(60, 240)]);
    const uses = cycles.filter((cycle) => cycle.pulses);
    expect(uses).toHaveLength(1);
    expect(uses[0]).toMatchObject({ powerW: 1200 });
    const drawnWh = power.reduce((sum, watts) => sum + watts - 240, 0) / 3600;
    expect(uses[0]!.energyWh).toBeGreaterThan(drawnWh * 0.9);
  });

  it('joins the continuous heating of a plate at full power to its pulses', () => {
    // 1200 W for 6 min, then 12 s on and 8 s off for 5 min.
    const cycles = cyclesOf([
      ...flat(60, 240),
      ...flat(360, 1440),
      ...flat(8, 240),
      ...pulses(15, 12, 8, 1200, 240),
      ...flat(60, 240),
    ]);
    expect(cycles).toHaveLength(1);
    // 1200 W × (360 + 15 × 12) s = 648 000 J = 180 Wh.
    expect(cycles[0]).toMatchObject({ start: 1_790_000_060, powerW: 1200, energyWh: 180 });
    expect(cycles[0]!.pulses).toEqual({ count: 16, onS: 540 });
  });

  it('makes one use of a plate pulsing, another heating meanwhile, then both', () => {
    // Plate A pulses (10 s on, 34 s off) for 10 min; plate B heats 1200 W from 4:00 to 9:00,
    // then pulses (12 s on, 8 s off) until 14:00 (the real hob of 26/10, simplified).
    const power = Array.from({ length: 840 }, (_, second) => {
      const a = second < 600 && second % 44 < 10 ? 1200 : 0;
      const b =
        second >= 240 && second < 540 ? 1200 : second >= 543 && (second - 543) % 20 < 12 ? 1200 : 0;
      return 240 + a + b;
    });
    const cycles = cyclesOf([...flat(60, 240), ...power, ...flat(60, 240)]);
    expect(cycles.filter((cycle) => cycle.pulses)).toHaveLength(1);
  });

  it('keeps a kettle apart from a hob pulsing at another power', () => {
    const cycles = cyclesOf([
      ...flat(30, 240),
      ...flat(150, 2240),
      ...flat(20, 240),
      ...pulses(6, 10, 10, 1200, 240),
      ...flat(60, 240),
    ]);
    expect(cycles.map((cycle) => [cycle.powerW, cycle.pulses?.count ?? 1])).toEqual([
      [2000, 1],
      [1200, 6],
    ]);
  });

  it('groups a pulsing hob apart from a kettle of the same power', () => {
    const cycles = cyclesOf([
      ...flat(30, 160),
      ...pulses(6, 10, 10, 2000, 160),
      ...flat(600, 160),
      ...flat(150, 2160),
      ...flat(30, 160),
    ]);
    const groups = groupCycles(cycles);
    expect(groups.map((group) => [group.count, group.pulsing])).toEqual([
      [1, false],
      [1, true],
    ]);
  });

  it('changes nothing on the demonstration day (no pulsing appliance)', () => {
    const data = generateDemo(Date.parse('2026-10-22T23:00:00Z') / 1000);
    const from = startOfLisbonDay('2026-10-21');
    const to = startOfLisbonDay('2026-10-22');
    const offset = (from - data.start) / 60;
    const day = Array.from({ length: (to - from) / 60 }, (_, index) => ({
      ts: from + index * 60,
      readings: data.seconds(offset + index),
    }));
    const cycles = pairCycles(detectEvents(toSeries(day, from, to)));
    expect(mergePulses(cycles)).toEqual(cycles);
  });
});
