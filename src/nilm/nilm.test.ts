// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { generateDemo } from '../demo/model';
import { encodeSeconds } from '../lib/readings-1s';
import { lisbonDate, startOfLisbonDay } from '../lib/time';
import { pairCycles } from './cycles';
import { groupCycles } from './summary';
import { detectEvents, steadyStates } from './events';
import {
  decodeSecondsRecords,
  MISSING,
  SECONDS_RECORD_BYTES,
  toSeries,
  type SecondsSeries,
} from './series';

const START = 1_790_000_000;

/** A series from per-second power (W); 50 var and 230,0 V throughout unless given. */
function series(power: number[], voltage = 2300, nonActive?: number[]): SecondsSeries {
  return {
    start: START,
    power: Int32Array.from(power),
    nonActive: Int32Array.from(nonActive ?? power.map(() => 50)),
    voltage: Int32Array.from(power.map(() => voltage)),
  };
}

/** `seconds` of `watts`, with ±`noise` alternating. */
const flat = (seconds: number, watts: number, noise = 0) =>
  Array.from({ length: seconds }, (_, second) => watts + (second % 2 === 0 ? noise : -noise));

describe('detectEvents', () => {
  it('finds a kettle switching on and off, and pairs the cycle', () => {
    // 160 W base, 2000 W more for 150 s: 2000 × 150 / 3600 = 83,3 Wh.
    const events = detectEvents(
      series([...flat(100, 160, 5), ...flat(150, 2160, 5), ...flat(100, 160, 5)]),
    );
    expect(events).toMatchObject([
      { ts: START + 100, deltaW: 2000, deltaW230: 2000, beforeW: 160, afterW: 2160, transientS: 0 },
      { ts: START + 250, deltaW: -2000, transientS: 0 },
    ]);
    expect(pairCycles(events)).toMatchObject([
      { start: START + 100, end: START + 250, durationS: 150, powerW: 2000, energyWh: 83 },
    ]);
  });

  it('ignores noise and steps under 30 W', () => {
    expect(detectEvents(series([...flat(60, 2000, 20), ...flat(60, 2025, 20)]))).toEqual([]);
  });

  it('measures a start-up peak above the new level', () => {
    // A fridge compressor: one second at 400 W, then 110 W over the 160 W base.
    const events = detectEvents(series([...flat(30, 160), 560, ...flat(60, 270)]));
    expect(events).toMatchObject([{ deltaW: 110, overshootW: 290, transientS: 1, ramp: false }]);
  });

  it('tells a ramp from a step', () => {
    // An inverter: 0 to 1000 W more over 10 s.
    const ramp = Array.from({ length: 10 }, (_, second) => 200 + (second + 1) * 100);
    const [event] = detectEvents(
      series([...flat(30, 200), ...ramp.slice(0, 9), ...flat(60, 1200)]),
    );
    expect(event).toMatchObject({ deltaW: 1000, ramp: true, overshootW: 0 });
    expect(event?.transientS).toBe(9);
  });

  it('skips a change across missing seconds', () => {
    expect(detectEvents(series([...flat(30, 160), MISSING, MISSING, ...flat(30, 2160)]))).toEqual(
      [],
    );
  });

  it('scales the step to 230 V with the voltage after it', () => {
    // 2000 W at 240 V is 2000 × (230/240)² = 1836,8 W at 230 V.
    const [event] = detectEvents(series([...flat(30, 160), ...flat(30, 2160)], 2400));
    expect(event).toMatchObject({ deltaW: 2000, deltaW230: 1837 });
  });

  it('keeps the change of non-active power', () => {
    const power = [...flat(30, 160), ...flat(30, 560)];
    const nonActive = [...flat(30, 60), ...flat(30, 360)];
    expect(detectEvents(series(power, 2300, nonActive))).toMatchObject([{ deltaVar: 300 }]);
  });
});

describe('pairCycles', () => {
  it('pairs overlapping appliances by the size of their steps', () => {
    // Kettle on, fridge on, kettle off, fridge off.
    const events = detectEvents(
      series([
        ...flat(30, 160),
        ...flat(60, 2160),
        ...flat(60, 2270),
        ...flat(60, 270),
        ...flat(30, 160),
      ]),
    );
    expect(events.map((event) => event.deltaW)).toEqual([2000, 110, -2000, -110]);
    expect(pairCycles(events).map((cycle) => [cycle.powerW, cycle.durationS])).toEqual([
      [2000, 120],
      [110, 120],
    ]);
  });

  it('leaves an off step without a matching on step alone', () => {
    const events = detectEvents(series([...flat(30, 2160), ...flat(30, 160)]));
    expect(events).toHaveLength(1);
    expect(pairCycles(events)).toEqual([]);
  });
});

describe('series', () => {
  it('lays minutes out by second, missing where there is none', () => {
    const readings = {
      power: Array.from({ length: 60 }, (_, second) => second),
      nonActive: Array.from({ length: 60 }, () => 5),
      voltage: Array.from({ length: 60 }, () => 2300),
    };
    readings.power[3] = null as unknown as number;
    const records = new Uint8Array(SECONDS_RECORD_BYTES);
    new DataView(records.buffer).setUint32(0, START + 60, true);
    records.set(encodeSeconds(readings), 4);
    const result = toSeries(decodeSecondsRecords(records), START, START + 180);
    expect(result.power.length).toBe(180);
    expect([result.power[0], result.power[60], result.power[63], result.power[119]]).toEqual([
      MISSING,
      0,
      MISSING,
      59,
    ]);
    expect(steadyStates(result.power).length).toBeGreaterThan(0);
  });
});

describe('the demonstration house', () => {
  // A weekday with the fridge (110 W, 18 min every 50), the water heater (1800 W, ~1 h at
  // night), the kettle (2000 W, 2,5 min at 7:30), the TV (150 W from 18 h), dinner and the
  // dishwasher (1900 W at 22:30).
  const data = generateDemo(Date.parse('2026-10-22T23:00:00Z') / 1000);
  const day = '2026-10-21';
  const from = startOfLisbonDay(day);
  const to = startOfLisbonDay('2026-10-22');
  const first = (from - data.start) / 60;
  const minutes = Array.from({ length: (to - from) / 60 }, (_, index) => ({
    ts: from + index * 60,
    readings: data.seconds(first + index),
  }));
  const events = detectEvents(toSeries(minutes, from, to));
  const cycles = pairCycles(events);
  const near = (watts: number) => cycles.filter((cycle) => Math.abs(cycle.powerW - watts) <= 20);

  it('is the day it should be', () => {
    expect(lisbonDate(from)).toBe(day);
    expect(lisbonDate(data.start)).not.toBe(day);
  });

  it('finds every fridge cycle, 18 minutes each', () => {
    const fridge = near(110);
    // 24 h / 50 min: 28 or 29 starts in the day, less one or two across midnight.
    expect(fridge.length).toBeGreaterThanOrEqual(27);
    for (const cycle of fridge) expect(cycle.durationS).toBe(18 * 60);
  });

  it('finds the water heater, the kettle and the dishwasher', () => {
    const heater = near(1800);
    expect(heater).toHaveLength(1);
    expect(heater[0]!.durationS).toBeGreaterThanOrEqual(70 * 60);
    expect(near(2000).some((cycle) => cycle.durationS === 150)).toBe(true);
    expect(near(1900)).toHaveLength(1);
  });

  it('groups the cycles by power, the fridge in one line', () => {
    const groups = groupCycles(cycles);
    const fridge = groups.find((group) => Math.abs(group.powerW - 110) <= 20);
    expect(fridge?.count).toBe(near(110).length);
    expect(fridge?.durationS).toBe(18 * 60);
    // The water heater, the dishwasher and the kettle are never in one group. (The demo's
    // loads keep their power whatever the voltage, so at 230 V one kettle may split in two.)
    for (const group of groups) {
      const measured = group.cycles.map((cycle) => cycle.powerW);
      expect(Math.max(...measured) - Math.min(...measured)).toBeLessThanOrEqual(60);
    }
    // Most energy first.
    for (let index = 1; index < groups.length; index++) {
      expect(groups[index - 1]!.energyWh).toBeGreaterThanOrEqual(groups[index]!.energyWh);
    }
  });

  it('pairs nearly every step', () => {
    const paired = cycles.length * 2;
    expect(paired / events.length).toBeGreaterThan(0.9);
  });
});
