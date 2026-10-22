// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import powerTiers from '../data/power-tiers.json';
import { tariffInputSchema, tariffOn } from './tariff';

const base = {
  validFrom: '2026-10-01',
  supplier: 'Teste',
  powerVa: 6900,
  option: 'bi',
  cycle: 'weekly',
  periodsMap: 'pre-2027',
  fixedPerDay: 343_600,
  energy: { offEmpty: 200_000, empty: 100_000, simple: 150_000 },
  iecPerKwh: 1_000,
  cavPerMonth: 2_850_000,
  dgegPerMonth: 70_000,
  largeFamily: false,
};

describe('tariffInputSchema', () => {
  it('keeps only the prices of the chosen option', () => {
    const parsed = tariffInputSchema.parse(base);
    expect(parsed.energy).toEqual({ offEmpty: 200_000, empty: 100_000 });
  });

  it('requires every price of the option', () => {
    const result = tariffInputSchema.safeParse({ ...base, option: 'tri' });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual([
      'energy.peak',
      'energy.full',
    ]);
  });

  it('rejects prices that are not integer micro-euros, and absurd powers', () => {
    expect(tariffInputSchema.safeParse({ ...base, fixedPerDay: 0.3436 }).success).toBe(false);
    expect(tariffInputSchema.safeParse({ ...base, powerVa: 100 }).success).toBe(false);
  });

  it('accepts every ERSE power tier (docs/contracted-power.md)', () => {
    for (const powerVa of powerTiers.tiersVa) {
      expect(tariffInputSchema.safeParse({ ...base, powerVa }).success).toBe(true);
    }
  });
});

describe('tariffOn', () => {
  const tariffs = [{ validFrom: '2026-01-01' }, { validFrom: '2026-10-01' }];

  it('picks the latest contract that started on or before the day', () => {
    expect(tariffOn(tariffs, '2025-12-31')).toBeNull();
    expect(tariffOn(tariffs, '2026-09-30')?.validFrom).toBe('2026-01-01');
    expect(tariffOn(tariffs, '2026-10-01')?.validFrom).toBe('2026-10-01');
  });
});
