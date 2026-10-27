// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  applianceTotals,
  classify,
  confusable,
  describeCycle,
  describeGroup,
  durationRange,
  groupAppliance,
  nameAppliance,
  seriesEnergyWh,
  type Appliance,
} from './appliances';
import { pairCycles } from './cycles';
import { detectEvents } from './events';
import { mergePulses } from './periodic';
import { MISSING, type SecondsSeries } from './series';
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
const pulses = (count: number, on: number, off: number, watts: number, base: number) =>
  Array.from({ length: count }, () => [...flat(on, base + watts), ...flat(off, base)]).flat();
const cyclesOf = (power: number[]) => mergePulses(pairCycles(detectEvents(series(power))));

const appliance = (
  id: string,
  label: string,
  powerW: number,
  extra: Partial<Appliance> = {},
): Appliance => ({
  id,
  label,
  powerW,
  statesW: [powerW],
  pulsing: false,
  minDurationS: null,
  maxDurationS: null,
  heats: null,
  ...extra,
});

describe('classify', () => {
  it('names the cycles that fit, the closest power winning', () => {
    // Fridge 100 W (twice), kettle 2000 W, water heater 1800 W, something of 600 W.
    const cycles = cyclesOf([
      ...flat(30, 160),
      ...flat(300, 260),
      ...flat(300, 160),
      ...flat(120, 2160),
      ...flat(60, 160),
      ...flat(300, 260),
      ...flat(60, 160),
      ...flat(600, 1960),
      ...flat(60, 160),
      ...flat(200, 760),
      ...flat(60, 160),
    ]);
    const fridge = appliance('f', 'Frigorífico', 104);
    const kettle = appliance('k', 'Chaleira', 1960);
    const heater = appliance('h', 'Termoacumulador', 1850);
    const named = classify(cycles, [fridge, kettle, heater]);
    expect(cycles.map((cycle) => named.get(cycle.start)?.label ?? null)).toEqual([
      'Frigorífico',
      'Chaleira',
      'Frigorífico',
      'Termoacumulador',
      null,
    ]);
  });

  it('keeps the shapes apart: pulses, and appliances with several states', () => {
    const cycles = cyclesOf([
      ...flat(30, 160),
      ...pulses(6, 10, 10, 2000, 160),
      ...flat(600, 160),
      ...flat(150, 2160),
      ...flat(60, 160),
      // A washing machine: heating 2000 W, then the motor at 400 W.
      ...flat(600, 2160),
      ...flat(600, 560),
      ...flat(60, 160),
    ]);
    const hob = appliance('p', 'Placa', 2000, { pulsing: true });
    const kettle = appliance('k', 'Chaleira', 2000);
    const washer = appliance('w', 'Máquina de lavar', 2000, { statesW: [2000, 400] });
    const named = classify(cycles, [hob, kettle, washer]);
    expect(cycles.map((cycle) => named.get(cycle.start)?.label)).toEqual([
      'Placa',
      'Chaleira',
      'Máquina de lavar',
    ]);
    // 1200 s: half to twice.
    expect(describeCycle(cycles[2]!)).toEqual({
      powerW: 2000,
      statesW: [2000, 400],
      pulsing: false,
      minDurationS: 600,
      maxDurationS: 2400,
      heats: null,
    });
  });

  it('names a group by most of its cycles, from its descriptor', () => {
    const cycles = cyclesOf([
      ...flat(30, 160),
      ...flat(300, 260),
      ...flat(300, 160),
      ...flat(300, 260),
      ...flat(300, 160),
    ]);
    const [group] = groupCycles(cycles);
    const fridge = { id: 'f', label: 'Frigorífico', ...describeGroup(group!) };
    // Cycles of 300 s: 150 to 600 s.
    expect(fridge).toMatchObject({
      powerW: 100,
      statesW: [100],
      pulsing: false,
      minDurationS: 150,
      maxDurationS: 600,
    });
    expect(groupAppliance(group!, classify(cycles, [fridge]))).toBe(fridge);
    expect(groupAppliance(group!, new Map())).toBeNull();
  });

  it('gives a tie to the appliance named last (a correction)', () => {
    const cycles = cyclesOf([...flat(30, 160), ...flat(600, 2120), ...flat(60, 160)]);
    const washer = { ...appliance('w', 'Máquina de lavar', 1960), createdAt: 100 };
    const dishwasher = { ...appliance('d', 'Máquina da loiça', 1960), createdAt: 200 };
    expect(classify(cycles, [dishwasher, washer]).get(cycles[0]!.start)).toBe(dishwasher);
    expect(classify(cycles, [washer, dishwasher]).get(cycles[0]!.start)).toBe(dishwasher);
  });

  it('does not take a 150 W television for a 110 W fridge', () => {
    const cycles = cyclesOf([...flat(30, 160), ...flat(600, 310), ...flat(60, 160)]);
    expect(classify(cycles, [appliance('f', 'Frigorífico', 110)]).size).toBe(0);
    expect(classify(cycles, [appliance('t', 'Televisão', 140)]).size).toBe(1);
  });
});

describe('durations', () => {
  // A kettle of 2000 W for 3 min and a washing machine heating at 2000 W for 11 min.
  const day = [
    ...flat(30, 160),
    ...flat(180, 2160),
    ...flat(600, 160),
    ...flat(660, 2160),
    ...flat(60, 160),
  ];

  it('keeps a kettle apart from a washing machine heating at the same power', () => {
    const cycles = cyclesOf(day);
    const washer = { id: 'w', label: 'Máquina de lavar', ...describeCycle(cycles[1]!) };
    expect(washer).toMatchObject({ minDurationS: 330, maxDurationS: 1320 });
    const named = classify(cycles, [washer]);
    expect(cycles.map((cycle) => named.get(cycle.start)?.label ?? null)).toEqual([
      null,
      'Máquina de lavar',
    ]);
    // Named before there were ranges: any duration fits.
    expect(classify(cycles, [appliance('o', 'Antigo', 2000)]).size).toBe(2);
  });

  it('widens the range when the same appliance is named in another programme', () => {
    const washer = appliance('w', 'Máquina de lavar', 1961, {
      minDurationS: 337,
      maxDurationS: 1348,
    });
    // A 60 °C programme heating for 30 min, named the same (case and spaces apart).
    const long = describeCycle(
      cyclesOf([...flat(30, 160), ...flat(1800, 2120), ...flat(60, 160)])[0]!,
    );
    expect(nameAppliance(' máquina de LAVAR ', long, [washer])).toEqual({
      kind: 'widen',
      appliance: washer,
      durations: { minS: 337, maxS: 3600 },
    });
    // Another name, or another shape, is another appliance.
    expect(nameAppliance('Chaleira', long, [washer])).toEqual({ kind: 'create' });
    expect(nameAppliance('Máquina de lavar', { ...long, statesW: [1960, 400] }, [washer])).toEqual({
      kind: 'create',
    });
    expect(durationRange([1])).toEqual({ minS: 1, maxS: 2 });
  });

  it('tells when two appliances cannot be kept apart', () => {
    // The washing machine and the dishwasher of 26/10, both heating water.
    const washer = appliance('w', 'Máquina de lavar', 1961, {
      minDurationS: 337,
      maxDurationS: 1348,
    });
    const dishwasher = { ...washer, powerW: 2033, minDurationS: 365, maxDurationS: 1462 };
    expect(confusable(washer, dishwasher)).toBe(true);
    // A kettle: 2 kW too, but 3 minutes.
    expect(confusable(washer, { ...washer, minDurationS: 90, maxDurationS: 300 })).toBe(false);
    expect(confusable(washer, { ...washer, powerW: 1200 })).toBe(false);
  });

  it('adds up descriptors with the same name', () => {
    const cycles = cyclesOf(day);
    const named = classify(cycles, [
      appliance('a', 'Máquina de lavar', 2000, { minDurationS: 100, maxDurationS: 300 }),
      appliance('b', 'Máquina de lavar ', 2000, { minDurationS: 500, maxDurationS: 900 }),
    ]);
    const { totals } = applianceTotals(cycles, named, 1000);
    expect(totals.map((total) => [total.appliance.id, total.cycles])).toEqual([['a', 2]]);
  });
});

describe('applianceTotals', () => {
  it('adds the energy per appliance and the share of the day it explains', () => {
    // Two fridge cycles of 300 s at 100 W (8 Wh each) and a kettle of 120 s at 2000 W (67 Wh).
    const power = [
      ...flat(30, 160),
      ...flat(300, 260),
      ...flat(300, 160),
      ...flat(120, 2160),
      ...flat(60, 160),
      ...flat(300, 260),
      ...flat(60, 160),
    ];
    const cycles = cyclesOf(power);
    const fridge = appliance('f', 'Frigorífico', 100);
    const kettle = appliance('k', 'Chaleira', 2000);
    const day = seriesEnergyWh(series(power));
    // 160 W × 1170 s + 100 W × 600 s + 2000 W × 120 s = 487 200 J = 135 Wh.
    expect(day).toBe(135);
    const { totals, explainedPct } = applianceTotals(
      cycles,
      classify(cycles, [fridge, kettle]),
      day,
    );
    expect(totals.map((total) => [total.appliance.label, total.cycles, total.energyWh])).toEqual([
      ['Chaleira', 1, 67],
      ['Frigorífico', 2, 16],
    ]);
    // (67 + 16) / 135.
    expect(explainedPct).toBe(61);
    expect(applianceTotals(cycles, new Map(), 0).explainedPct).toBeNull();
  });

  it('counts missing seconds as nothing', () => {
    expect(seriesEnergyWh(series([3600, MISSING, 3600]))).toBe(2);
  });
});
