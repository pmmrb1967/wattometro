// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { energyAxis, niceTicks, powerAxis } from './chart-axis';

describe('niceTicks', () => {
  it('takes round steps from zero to just above the largest value', () => {
    expect(niceTicks(1610)).toEqual([0, 500, 1000, 1500, 2000]);
    expect(niceTicks(900)).toEqual([0, 250, 500, 750, 1000]);
    expect(niceTicks(12_400)).toEqual([0, 5000, 10_000, 15_000]);
    expect(niceTicks(3)).toEqual([0, 1, 2, 3]);
    expect(niceTicks(2000)).toEqual([0, 500, 1000, 1500, 2000]);
    expect(niceTicks(0)).toEqual([0, 1]);
  });
});

describe('axes', () => {
  it('power in W below 1 kW and in kW from there', () => {
    expect(powerAxis(620)).toEqual({
      unit: 'W',
      ticks: [0, 200, 400, 600, 800].map((value) => ({ value, label: String(value) })),
    });
    expect(powerAxis(3400).unit).toBe('kW');
    expect(powerAxis(3400).ticks.map((tick) => tick.label)).toEqual(['0', '1', '2', '3', '4']);
    expect(powerAxis(1610).ticks.map((tick) => tick.label)).toEqual(['0', '0,5', '1', '1,5', '2']);
  });

  it('energy in kWh', () => {
    expect(energyAxis(7300).ticks.map((tick) => tick.label)).toEqual(['0', '2', '4', '6', '8']);
    expect(energyAxis(7300).unit).toBe('kWh');
  });
});
