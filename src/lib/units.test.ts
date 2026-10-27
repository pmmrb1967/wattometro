// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  formatCelsius,
  formatKva,
  formatKwh,
  formatPower,
  formatVolts,
  roundedKwh,
  sumWh,
  toTenthsCelsius,
} from './units';

// Intl in pt-PT uses a no-break space as thousands separator.
const plain = (text: string) => text.replace(/\s/g, ' ');

describe('sumWh', () => {
  it('adds integer Wh', () => {
    expect(sumWh([100, 250, 1])).toBe(351);
    expect(sumWh([])).toBe(0);
  });

  it('rejects fractional values', () => {
    expect(() => sumWh([1, 0.5])).toThrow(TypeError);
  });
});

describe('roundedKwh', () => {
  it.each([
    [0, 0],
    [1499, 1],
    [1500, 2],
    [12_345, 12],
  ])('%i Wh → %i kWh', (wh, kwh) => {
    expect(roundedKwh(wh)).toBe(kwh);
  });
});

describe('formatting', () => {
  it('formats energy in kWh', () => {
    expect(formatKwh(12_345)).toBe('12,3\u00a0kWh');
    expect(formatKwh(500, 2)).toBe('0,50\u00a0kWh');
    // pt-PT only groups thousands from five digits on.
    expect(formatKwh(1_234_500)).toBe('1234,5\u00a0kWh');
    expect(plain(formatKwh(12_345_600))).toBe('12 345,6 kWh');
  });

  it('formats power in W or kW', () => {
    expect(formatPower(850)).toBe('850\u00a0W');
    expect(formatPower(3450)).toBe('3,45\u00a0kW');
    expect(formatPower(6900)).toBe('6,90\u00a0kW');
  });

  it('formats voltage from decivolts', () => {
    expect(formatVolts(2305)).toBe('230,5\u00a0V');
    expect(formatVolts(2530)).toBe('253,0\u00a0V');
  });

  it('rejects non-integer input', () => {
    expect(() => formatKwh(1.5)).toThrow(TypeError);
    expect(() => formatPower(0.1)).toThrow(TypeError);
    expect(() => formatVolts(230.5)).toThrow(TypeError);
  });
});

describe('formatKva', () => {
  it('shows the ERSE tiers as on invoices', () => {
    expect(formatKva(6900)).toBe('6,9\u00a0kVA');
    expect(formatKva(10350)).toBe('10,35\u00a0kVA');
    expect(formatKva(41400)).toBe('41,4\u00a0kVA');
  });
});

describe('temperature', () => {
  it('keeps tenths of a degree as integers', () => {
    expect(toTenthsCelsius(12.3)).toBe(123);
    expect(toTenthsCelsius(-0.4)).toBe(-4);
    expect(toTenthsCelsius(18.05)).toBe(181);
    expect(formatCelsius(123)).toBe('12,3\u00a0°C');
    expect(formatCelsius(-4)).toBe('-0,4\u00a0°C');
    expect(formatCelsius(155, 0)).toBe('16\u00a0°C');
    expect(() => formatCelsius(1.5)).toThrow(TypeError);
  });
});
