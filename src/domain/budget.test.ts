// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { budgetEnergyWh } from './budget';
import { electricityCost } from './electricity-cost';
import { tariffInputSchema } from './tariff';

const tariff = tariffInputSchema.parse({
  validFrom: '2026-01-01',
  supplier: 'Teste',
  powerVa: 10350,
  option: 'simple',
  cycle: 'daily',
  periodsMap: 'pre-2027',
  fixedPerDay: 500_000,
  energy: { simple: 150_000 },
  iecPerKwh: 1_000,
  cavPerMonth: 2_850_000,
  dgegPerMonth: 70_000,
  largeFamily: false,
  energyDiscountBp: 0,
  socialEnergyPerKwh: 0,
  socialPowerPerDay: 0,
  socialFinancingPerKwh: 0,
});

describe('budgetEnergyWh', () => {
  it('the most energy whose bill stays within the budget', () => {
    const wh = budgetEnergyWh({ simple: 300_000 }, 30, tariff, 8000);
    expect(wh).not.toBeNull();
    const at = (energy: number) => electricityCost({ simple: energy }, 30, tariff).totalCents;
    expect(at(wh as number)).toBeLessThanOrEqual(8000);
    expect(at((wh as number) + 1)).toBeGreaterThan(8000);
  });

  it('keeps the split between periods', () => {
    const tri = {
      ...tariff,
      option: 'tri' as const,
      energy: { peak: 250_000, full: 150_000, empty: 90_000 },
    };
    const cheap = budgetEnergyWh({ peak: 0, full: 0, empty: 300_000 }, 30, tri, 8000) as number;
    const dear = budgetEnergyWh({ peak: 300_000, full: 0, empty: 0 }, 30, tri, 8000) as number;
    expect(cheap).toBeGreaterThan(dear);
  });

  it('none when the fixed terms alone pass it, or without a split', () => {
    expect(budgetEnergyWh({ simple: 300_000 }, 30, tariff, 500)).toBeNull();
    expect(budgetEnergyWh({}, 30, tariff, 8000)).toBeNull();
  });
});
