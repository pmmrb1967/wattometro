// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { AnnualUsage } from './compare';
import { carCost, carWhPerYear, usageWithCar } from './electric-car';
import type { TariffInput } from './tariff';

// Above 6,9 kVA, no fixed term nor taxes: every kWh at its price + 23 % VAT.
const tri: TariffInput = {
  validFrom: '2026-01-01',
  supplier: null,
  powerVa: 10_350,
  option: 'tri',
  cycle: 'daily',
  periodsMap: 'pre-2027',
  fixedPerDay: 0,
  energy: { peak: 250_000, full: 180_000, empty: 100_000 },
  iecPerKwh: 0,
  cavPerMonth: 0,
  dgegPerMonth: 0,
  largeFamily: false,
  energyDiscountBp: 0,
  socialEnergyPerKwh: 0,
  socialPowerPerDay: 0,
  socialFinancingPerKwh: 0,
};

const split = { empty: 1_000_000, full: 1_500_000, peak: 500_000 };
const usage: AnnualUsage = {
  totalWh: 3_000_000,
  byCycle: { daily: split, weekly: split },
  days: 365,
  extrapolated: false,
};

describe('carWhPerYear', () => {
  it('km × kWh per 100 km', () => {
    // 15 000 km at 16,5 kWh/100 km: 2475 kWh.
    expect(carWhPerYear({ kmPerYear: 15_000, tenthsKwhPer100Km: 165 })).toBe(2_475_000);
    expect(carWhPerYear({ kmPerYear: -5, tenthsKwhPer100Km: 165 })).toBe(0);
  });
});

describe('usageWithCar', () => {
  it('all in empty, or in the house’s own proportions', () => {
    expect(usageWithCar(usage, 1_000_000, 'empty').byCycle.daily).toEqual({
      empty: 2_000_000,
      full: 1_500_000,
      peak: 500_000,
    });
    // 1000 kWh: half to full, a sixth to peak (166,7 → 167), the rest to empty.
    const anytime = usageWithCar(usage, 1_000_000, 'anytime');
    expect(anytime.byCycle.daily).toEqual({ empty: 1_333_333, full: 2_000_000, peak: 666_667 });
    expect(anytime.totalWh).toBe(4_000_000);
  });
});

describe('carCost', () => {
  it('what 1000 kWh add at night and at any hour, by hand', () => {
    const cost = carCost(
      usage,
      tri,
      { kmPerYear: 10_000, tenthsKwhPer100Km: 100 },
      [],
      '2026-10-29',
    );
    expect(cost.carWh).toBe(1_000_000);
    // At night: 1000 kWh × 0,10 € × 1,23 = 123,00 €.
    expect(cost.emptyCents).toBe(12_300);
    // Any hour: (333,333 × 0,10 + 500 × 0,18 + 166,667 × 0,25) = 165,00 €; with VAT, 202,95 €.
    expect(cost.anytimeCents).toBe(20_295);
    expect(cost.best).toBeNull();
    // The year was 495 € + VAT = 608,85 €; with the car at night, 731,85 €.
    expect(cost.currentWithCarCents).toBe(73_185);
  });
});
