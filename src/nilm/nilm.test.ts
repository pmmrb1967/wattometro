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

  it('follows an appliance that changes state in the same second', () => {
    // Washing machine: heating 2000 W (100 var) for 20 min, then the motor 400 W (300 var)
    // for 60 min. 2000 × 1200 / 3600 + 400 × 3600 / 3600 = 666,7 + 400 = 1067 Wh.
    const power = [...flat(30, 160), ...flat(1200, 2160), ...flat(3600, 560), ...flat(30, 160)];
    const nonActive = [...flat(30, 60), ...flat(1200, 160), ...flat(3600, 360), ...flat(30, 60)];
    const events = detectEvents(series(power, 2300, nonActive));
    expect(events.map((event) => [event.deltaW, event.deltaVar])).toEqual([
      [2000, 100],
      [-1600, 200],
      [-400, -300],
    ]);
    expect(pairCycles(events)).toMatchObject([
      {
        start: START + 30,
        durationS: 4800,
        powerW: 2000,
        energyWh: 1067,
        states: [
          { from: START + 30, powerW: 2000 },
          { from: START + 1230, powerW: 400 },
        ],
      },
    ]);
  });

  it('does not take a small step down for a phase of a large appliance', () => {
    // The TV, switched on before the day began, goes off while the water heater is on.
    const events = detectEvents(
      series([...flat(30, 310), ...flat(600, 2110), ...flat(600, 1960), ...flat(30, 160)]),
    );
    expect(events.map((event) => event.deltaW)).toEqual([1800, -150, -1800]);
    expect(pairCycles(events)).toMatchObject([{ powerW: 1800, durationS: 1200, states: [{}] }]);
  });

  it('pairs a compressor that drew more as it ran, its small steps up included', () => {
    // A heat-pump dryer (27/10): on +230 W, then +40 W and +30 W, off −300 W back to 160 W.
    const events = detectEvents(
      series([
        ...flat(30, 160),
        ...flat(60, 390),
        ...flat(60, 430),
        ...flat(60, 460),
        ...flat(30, 160),
      ]),
    );
    expect(events.map((event) => event.deltaW)).toEqual([230, 40, 30, -300]);
    // One cycle, of the mean of its steps: (230 + 300) / 2.
    expect(pairCycles(events).map((cycle) => [cycle.powerW, cycle.durationS])).toEqual([
      [265, 180],
    ]);
  });

  it('closes two appliances that switch off in the same second', () => {
    // A motor (+200 W) and a compressor (+250 W) on, then −450 W at once.
    const events = detectEvents(
      series([...flat(30, 160), ...flat(60, 360), ...flat(60, 610), ...flat(30, 160)]),
    );
    expect(events.map((event) => event.deltaW)).toEqual([200, 250, -450]);
    expect(pairCycles(events).map((cycle) => [cycle.powerW, cycle.start - START])).toEqual([
      [200, 30],
      [250, 90],
    ]);
  });

  it('closes the two with the small steps one of them rose by', () => {
    // The end of the dryer (27/10): motor +200 W, compressor +220 W, +40 W, then −470 W.
    const events = detectEvents(
      series([
        ...flat(30, 160),
        ...flat(60, 360),
        ...flat(60, 580),
        ...flat(60, 620),
        ...flat(30, 150),
      ]),
    );
    expect(events.map((event) => event.deltaW)).toEqual([200, 220, 40, -470]);
    expect(pairCycles(events).map((cycle) => cycle.powerW)).toEqual([200, 220]);
  });

  it('takes two steps down a few seconds apart as one appliance switching off', () => {
    // A compressor of 27/10: on +240 W, off in two steps 15 s apart (−140 W, −100 W).
    const events = detectEvents(
      series([...flat(30, 160), ...flat(120, 400), ...flat(15, 260), ...flat(30, 160)]),
    );
    expect(events.map((event) => event.deltaW)).toEqual([240, -140, -100]);
    expect(pairCycles(events).map((cycle) => [cycle.powerW, cycle.durationS])).toEqual([
      [240, 135],
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

  it('follows the washing machine on Saturday: heating, then the motor', () => {
    const saturday = '2026-10-17';
    const start = startOfLisbonDay(saturday);
    const end = startOfLisbonDay('2026-10-18');
    const offset = (start - data.start) / 60;
    const day = Array.from({ length: (end - start) / 60 }, (_, index) => ({
      ts: start + index * 60,
      readings: data.seconds(offset + index),
    }));
    const saturdayCycles = pairCycles(detectEvents(toSeries(day, start, end)));
    const washing = saturdayCycles.filter((cycle) => cycle.states.length > 1);
    expect(washing).toHaveLength(1);
    expect(washing[0]!.durationS).toBe(80 * 60);
    expect(washing[0]!.states.map((state) => Math.round(state.powerW / 100) * 100)).toEqual([
      2000, 400,
    ]);
    // Not in one group with a kettle of the same 2000 W.
    const group = groupCycles(saturdayCycles).find((item) => item.cycles.includes(washing[0]!));
    expect(group?.cycles).toHaveLength(1);
    expect(group?.statesW).toHaveLength(2);
  });

  it('pairs nearly every step', () => {
    const paired = cycles.length * 2;
    expect(paired / events.length).toBeGreaterThan(0.9);
  });
});
