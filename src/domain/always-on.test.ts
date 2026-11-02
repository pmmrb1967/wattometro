// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  alwaysOnBalance,
  alwaysOnInputSchema,
  itemWatts,
  shareOfCost,
  yearWh,
  type AlwaysOnInput,
} from './always-on';

const item = (quantity: number, powerW: number | null): AlwaysOnInput => ({
  label: 'Aparelho',
  quantity,
  powerW,
  measured: false,
});

describe('itemWatts', () => {
  it('is the power of each one times how many there are', () => {
    expect(itemWatts(item(4, 3))).toBe(12);
  });

  it('is unknown without a power', () => {
    expect(itemWatts(item(5, null))).toBeNull();
  });
});

describe('alwaysOnBalance', () => {
  it('leaves what the list does not explain of the base', () => {
    expect(alwaysOnBalance([item(1, 12), item(4, 3)], 95)).toEqual({
      listedW: 24,
      withoutPower: 0,
      leftW: 71,
    });
  });

  it('counts those without a power apart: their watts are in what is left', () => {
    expect(alwaysOnBalance([item(1, 12), item(5, null), item(1, null)], 95)).toEqual({
      listedW: 12,
      withoutPower: 2,
      leftW: 83,
    });
  });

  it('goes below zero when the list adds up to more than the base', () => {
    expect(alwaysOnBalance([item(1, 130)], 95).leftW).toBe(-35);
  });

  it('explains nothing with an empty list', () => {
    expect(alwaysOnBalance([], 95)).toEqual({ listedW: 0, withoutPower: 0, leftW: 95 });
  });
});

describe('yearWh', () => {
  it('is the power through the 8760 hours of a year', () => {
    expect(yearWh(12)).toBe(105_120);
  });
});

describe('shareOfCost', () => {
  it('splits the cost of the list by power', () => {
    expect(shareOfCost(3000, 12, 60)).toBe(600);
  });

  it('is nothing when the list has no power', () => {
    expect(shareOfCost(0, 0, 0)).toBe(0);
  });
});

describe('alwaysOnInputSchema', () => {
  it('takes a name alone, with a power unknown', () => {
    const parsed = alwaysOnInputSchema.parse({
      label: '  Filtro do aquário ',
      quantity: 1,
      powerW: null,
      measured: false,
    });
    expect(parsed.label).toBe('Filtro do aquário');
  });

  it.each([
    [{ ...item(1, 10), label: ' ' }],
    [{ ...item(1, 10), label: 'x'.repeat(61) }],
    [item(0, 10)],
    [item(100, 10)],
    [item(1.5, 10)],
    [item(1, 0)],
    [item(1, 2.5)],
    [item(1, 5001)],
    // Nothing was measured if no power was given.
    [{ ...item(1, null), measured: true }],
  ])('refuses %j', (input) => {
    expect(alwaysOnInputSchema.safeParse(input).success).toBe(false);
  });
});
