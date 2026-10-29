// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { detectEvents } from './events';
import { findCycles } from './pipeline';
import type { SecondsSeries } from './series';
import { groupCycles } from './summary';

const START = 1_790_000_000;
const BASE = 200;

function series(power: number[]): SecondsSeries {
  return {
    start: START,
    power: Int32Array.from(power),
    nonActive: Int32Array.from(power.map(() => 50)),
    voltage: Int32Array.from(power.map(() => 2300)),
  };
}

const flat = (seconds: number, watts: number) => Array.from({ length: seconds }, () => watts);
/** A drum turning: 10 s at +300 W, 20 s still, for `seconds` (a spread of 300 W a minute). */
const drum = (seconds: number) =>
  Array.from({ length: seconds }, (_, second) => (second % 30 < 10 ? BASE + 300 : BASE));
/**
 * A drum turning steadily at +`watts`: a wobble of ±35 W every 5 s (real ones
 * spread 60–150 W a minute; on 27/10, 88–179 W).
 */
const steadyDrum = (seconds: number, watts: number) =>
  Array.from({ length: seconds }, (_, second) => BASE + watts + (second % 10 < 5 ? 35 : -35));
/**
 * A spin: the drum speeds up over 3 min (+200, +400, +600 W), then 2½ min at
 * full speed; it stops within a minute, as real ones do (29/10: 11:06:41).
 */
const spin = () => [
  ...steadyDrum(60, 200),
  ...steadyDrum(60, 400),
  ...steadyDrum(60, 600),
  ...flat(150, BASE + 600),
];
const cyclesOf = (power: number[]) => {
  const day = series(power);
  return findCycles(detectEvents(day), day);
};

// The dishwasher of 26/10, simplified: pump at +50 W, four heatings of 2 kW
// (12, 9, 3 and 11 min) with 5, 8 and 2 min of pump between.
const dishwasher = [
  ...flat(120, BASE),
  ...flat(300, BASE + 50),
  ...flat(720, BASE + 2050),
  ...flat(300, BASE + 50),
  ...flat(540, BASE + 2050),
  ...flat(480, BASE + 50),
  ...flat(180, BASE + 2050),
  ...flat(120, BASE + 50),
  ...flat(660, BASE + 2050),
  ...flat(600, BASE),
];

// The washing machine of 26/10, simplified: one 11-minute heating, 40 min of
// drum (from 20 s later), 5 min quiet (soaking), a 5½-minute spin up to +600 W.
const washer = [
  ...flat(120, BASE),
  ...flat(660, BASE + 1960),
  ...flat(20, BASE),
  ...drum(2380),
  ...flat(300, BASE),
  ...spin(),
  ...flat(900, BASE),
];

describe('mergeProgrammes', () => {
  it('makes the dishwasher one programme of four heatings, pump included', () => {
    const cycles = cyclesOf(dishwasher);
    const programmes = cycles.filter((cycle) => cycle.heats);
    expect(programmes).toHaveLength(1);
    const [programme] = programmes;
    // From the first heating (after 7 min) to the end of the last (49 min later).
    expect(programme).toMatchObject({
      start: START + 420,
      durationS: 720 + 300 + 540 + 480 + 180 + 120 + 660,
      heats: { count: 4, onS: 720 + 540 + 180 + 660 },
    });
    // 2050 W × 2100 s of heating plus 50 W × 900 s of pump: 1196 + 13 = 1208 Wh.
    expect(programme!.energyWh).toBeGreaterThanOrEqual(1200);
    expect(programme!.energyWh).toBeLessThanOrEqual(1215);
    // The pump between the heatings is part of it, not a cycle of its own.
    expect(cycles.filter((cycle) => cycle.start > programme!.start)).toHaveLength(0);
  });

  it('makes the washing machine one programme: heating, drum and spin', () => {
    const cycles = cyclesOf(washer);
    const programmes = cycles.filter((cycle) => cycle.heats);
    expect(programmes).toHaveLength(1);
    const [programme] = programmes;
    // Until the end of the minute the spin stops in: 660 + 2400 + 300 + 330 s, and 30 s.
    expect(programme).toMatchObject({ start: START + 120, heats: { count: 1, onS: 660 } });
    expect(programme!.durationS).toBe(3720);
    // 1960 W × 660 s, 300 W a third of 2400 s, the spin (200 + 400 + 600) × 60 s
    // and 600 W × 150 s: 359 + 67 + 20 + 25 = 471 Wh.
    expect(programme!.energyWh).toBeGreaterThanOrEqual(460);
    expect(programme!.energyWh).toBeLessThanOrEqual(477);
  });

  it('takes a heating that paused for a few seconds as one', () => {
    // The washing machine of 27/10: heating 70 s, 14 s off, 100 s, 11 s off, 8 min;
    // then the drum turning steadily, +150 W, for 30 min (a spread under ACTIVE_SPREAD_W).
    const power = [
      ...flat(120, BASE),
      ...flat(70, BASE + 1950),
      ...flat(14, BASE),
      ...flat(100, BASE + 1950),
      ...flat(11, BASE),
      ...flat(480, BASE + 1950),
      ...steadyDrum(1800, 150),
      ...flat(900, BASE),
    ];
    const programmes = cyclesOf(power).filter((cycle) => cycle.heats);
    expect(programmes).toHaveLength(1);
    // From the first piece; one heating; until the drum stops.
    expect(programmes[0]).toMatchObject({
      start: START + 120,
      heats: { count: 1, onS: 70 + 100 + 480 },
    });
    expect(programmes[0]!.end).toBe(START + 120 + 70 + 14 + 100 + 11 + 480 + 1800);
  });

  it('ends when the machine stops, not with something left on after it', () => {
    // 29/10: after the spin, the house stayed +120 W higher, flat, for 40 min.
    const power = [...washer.slice(0, -900), ...flat(2400, BASE + 120), ...flat(600, BASE)];
    const [programme] = cyclesOf(power).filter((cycle) => cycle.heats);
    expect(programme!.durationS).toBe(3720);
  });

  it('keeps the two machines in groups of their own', () => {
    const groups = groupCycles(cyclesOf([...washer, ...dishwasher]));
    const programmes = groups.filter((group) => group.heats !== null);
    expect(programmes.map((group) => group.heats).sort()).toEqual([1, 4]);
  });

  it('leaves a kettle, and a long heating with nothing after, as they are', () => {
    const kettle = [...flat(60, BASE), ...flat(180, BASE + 2000), ...drum(1200)];
    const heater = [...flat(60, BASE), ...flat(1800, BASE + 1800), ...flat(1200, BASE)];
    for (const power of [kettle, heater]) {
      expect(cyclesOf(power).filter((cycle) => cycle.heats)).toEqual([]);
    }
  });

  it('keeps heatings of other powers apart', () => {
    // A 2 kW heating, then 5 min later a 1.5 kW one: two appliances.
    const power = [
      ...flat(60, BASE),
      ...flat(600, BASE + 2000),
      ...flat(300, BASE),
      ...flat(600, BASE + 1500),
      ...flat(600, BASE),
    ];
    expect(cyclesOf(power).filter((cycle) => cycle.heats)).toEqual([]);
  });
});
