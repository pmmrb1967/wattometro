// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { fridgeOffAt, findFridge, type Fridge } from './fridge';
import { MISSING, type SecondsSeries } from './series';

const START = 1_790_000_000;
const MINUTE = 60;

function series(power: number[]): SecondsSeries {
  return {
    start: START,
    power: Int32Array.from(power),
    nonActive: Int32Array.from(power.map(() => 40)),
    voltage: Int32Array.from(power.map(() => 2300)),
  };
}

/** Seconds at a level, with the few watts of wobble of a quiet house. */
const flat = (minutes: number, watts: number) =>
  Array.from({ length: minutes * MINUTE }, (_, second) => watts + (second % 7) - 3);

/** The real fridge's night: +30 W, a pause of `pause` minutes every `every` minutes. */
const night = (times: number, every = 90, pause = 20, base = 95, watts = 30) =>
  Array.from({ length: times }, () => [
    ...flat(every - pause, base + watts),
    ...flat(pause, base),
  ]).flat();

const minuteOf = (at: number) => (at - START) / MINUTE;

describe('findFridge', () => {
  it('finds a house whose level drops for 20 minutes, again and again', () => {
    const fridge = findFridge(series([...night(5), ...flat(70, 125)]));
    expect(fridge?.pauses.map(({ start }) => minuteOf(start))).toEqual([70, 160, 250, 340, 430]);
    expect(fridge?.pauses.map(({ end }) => minuteOf(end))).toEqual([90, 180, 270, 360, 450]);
    expect(fridge?.powerW).toBe(30);
    // 70 minutes on in every 90.
    expect(fridge?.onPct).toBe(78);
  });

  it('measures the rise as the pause ends, not with what comes on minutes later', () => {
    // On 31/10, a quiet pause measured +47 W over the 5 minutes after it, +29 W over the first 3.
    const pause = [
      ...flat(66, 125),
      ...flat(4, 125),
      ...flat(20, 95),
      ...flat(2, 125),
      ...flat(3, 150),
      ...flat(40, 125),
    ];
    const fridge = findFridge(series([...pause, ...pause, ...pause, ...flat(70, 125)]));
    expect(fridge?.pauses).toHaveLength(3);
    expect(fridge?.powerW).toBe(30);
  });

  it('takes the fridge from the pauses of a quiet house, not from those with more on', () => {
    const busy = [...flat(70, 342), ...flat(20, 300)];
    const day = [...night(2), ...flat(30, 125), ...busy, ...busy, ...busy, ...flat(70, 342)];
    const fridge = findFridge(series(day));
    expect(fridge?.powerW).toBe(30);
    expect(fridge?.pauses.map(({ start }) => minuteOf(start))).toEqual([70, 160]);
  });

  it('gives what it uses in a day: its power for the share of the seconds it is on', () => {
    const fridge = findFridge(series([...night(5), ...flat(70, 125)]));
    // 520 min × 30 W × 78 % = 203 Wh.
    expect(fridge?.energyWh).toBe(203);
  });

  it('keeps the level with the fridge off, for telling it at any moment', () => {
    const fridge = findFridge(series([...night(5), ...flat(70, 125)])) as Fridge;
    expect(fridge.pauses.every(({ lowW }) => Math.abs(lowW - 95) <= 3)).toBe(true);
  });

  it('survives a minute of something else in a pause', () => {
    const day = [
      ...flat(70, 125),
      ...flat(8, 95),
      ...flat(1, 127),
      ...flat(11, 95),
      ...night(4),
      ...flat(70, 125),
    ];
    expect(findFridge(series(day))?.pauses[0]).toMatchObject({ start: START + 70 * MINUTE });
  });

  it('sees a pause that starts as something else switches off', () => {
    const day = [
      ...flat(40, 225),
      ...flat(30, 225),
      ...flat(20, 95),
      ...night(4),
      ...flat(70, 125),
    ];
    expect(findFridge(series(day))?.pauses.map(({ start }) => minuteOf(start))[0]).toBe(70);
  });

  it('copes with minutes the Shelly did not send', () => {
    const day = [...night(5), ...flat(70, 125)];
    day.fill(MISSING, 75 * MINUTE, 77 * MINUTE);
    expect(findFridge(series(day))?.pauses).toHaveLength(5);
  });

  it('leaves out a dip of another power or length that same day', () => {
    const day = [
      ...night(3),
      ...flat(30, 125),
      ...flat(70, 175),
      ...flat(20, 120), // 55 W lower
      ...flat(70, 175),
      ...flat(29, 95), // 9 minutes longer
      ...flat(70, 125),
    ];
    const fridge = findFridge(series(day));
    expect(fridge?.pauses.map(({ start }) => minuteOf(start))).toEqual([70, 160, 250]);
  });

  it('finds nothing in a flat house', () => {
    expect(findFridge(series(flat(600, 125)))).toBeNull();
  });

  it('wants more than one pause', () => {
    expect(findFridge(series([...flat(100, 125), ...flat(20, 95), ...flat(100, 125)]))).toBeNull();
  });

  it('does not take a fridge that the detector sees for a pause', () => {
    // 110 W on and off: ordinary cycles (cycles.ts), named by the user.
    expect(findFridge(series(night(6, 50, 32, 160, 110)))).toBeNull();
  });

  it('does not take dips of a few minutes, or of an hour', () => {
    expect(findFridge(series(night(6, 90, 8)))).toBeNull();
    expect(findFridge(series(night(6, 120, 45)))).toBeNull();
  });

  it('gives no share of the time when its pauses are too far apart to measure it', () => {
    const fridge = findFridge(series([...night(1, 90), ...night(1, 400), ...flat(70, 125)]));
    expect(fridge?.pauses).toHaveLength(2);
    expect(fridge?.onPct).toBeNull();
    expect(fridge?.energyWh).toBeNull();
  });
});

describe('fridgeOffAt', () => {
  const fridge: Fridge = {
    powerW: 30,
    onPct: 80,
    energyWh: 500,
    pauses: [
      { start: 1000, end: 2000, lowW: 95 },
      // A pause seen with something else on: on 26/10, one at 862 W.
      { start: 9000, end: 10_000, lowW: 862 },
    ],
  };

  it('knows a level of the day with the fridge off, by the levels of its pauses', () => {
    expect(fridgeOffAt(fridge, 98)).toBe(true);
    expect(fridgeOffAt(fridge, 125)).toBe(false);
  });

  it('does not take for it a level far under a pause seen with something else on', () => {
    expect(fridgeOffAt(fridge, 200)).toBe(false);
    expect(fridgeOffAt(fridge, 60)).toBe(false);
  });
});
