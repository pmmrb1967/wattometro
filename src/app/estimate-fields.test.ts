// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { estimateOf, fieldsOf, suggestedBasis } from './estimate-fields';

describe('estimate fields', () => {
  it('turns the form text into an estimate', () => {
    expect(estimateOf({ basis: 'year', label: '250', use: '' })).toEqual({
      basis: 'year',
      labelWh: 250_000,
    });
    expect(estimateOf({ basis: 'cycles100', label: '58,5', use: '4' })).toEqual({
      basis: 'cycles100',
      labelWh: 58_500,
      cyclesPerWeek: 4,
    });
    expect(estimateOf({ basis: 'hours1000', label: '70', use: '3:30' })).toEqual({
      basis: 'hours1000',
      labelWh: 70_000,
      minutesPerDay: 210,
    });
    expect(estimateOf({ basis: 'plate', label: '', use: '0:10' })).toEqual({
      basis: 'plate',
      minutesPerDay: 10,
    });
  });

  it('gives none without a basis, and invalid for what is missing or wrong', () => {
    expect(estimateOf({ basis: '', label: '250', use: '4' })).toBeNull();
    expect(estimateOf({ basis: 'cycles100', label: '58', use: '' })).toBe('invalid');
    expect(estimateOf({ basis: 'year', label: 'muito', use: '' })).toBe('invalid');
    expect(estimateOf({ basis: 'plate', label: '', use: '25:00' })).toBe('invalid');
  });

  it('writes an estimate back as the form holds it', () => {
    expect(fieldsOf({ basis: 'cycles100', labelWh: 58_500, cyclesPerWeek: 4 })).toEqual({
      basis: 'cycles100',
      label: '58,500',
      use: '4',
    });
    expect(fieldsOf({ basis: 'plate', minutesPerDay: 10 })).toEqual({
      basis: 'plate',
      label: '',
      use: '0:10',
    });
    expect(fieldsOf(null)).toEqual({ basis: '', label: '', use: '' });
  });

  it('suggests the label of each kind', () => {
    expect(suggestedBasis('fridge')).toBe('year');
    expect(suggestedBasis('dryer')).toBe('cycles100');
    expect(suggestedBasis('tv')).toBe('hours1000');
    expect(suggestedBasis('kettle')).toBe('plate');
    expect(suggestedBasis('')).toBe('plate');
  });
});
