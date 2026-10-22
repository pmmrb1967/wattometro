// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { startOfLisbonDay } from '../lib/time';
import { electricityCost, energyByPeriod, reducedVatWh } from './electricity-cost';
import type { TariffInput } from './tariff';

const simple: TariffInput = {
  validFrom: '2026-01-01',
  supplier: null,
  powerVa: 6900,
  option: 'simple',
  cycle: 'daily',
  periodsMap: 'pre-2027',
  fixedPerDay: 343_600, // 0,3436 €/day
  energy: { simple: 166_500 }, // 0,1665 €/kWh
  iecPerKwh: 1_000, // 0,001 €/kWh
  cavPerMonth: 2_850_000, // 2,85 €/month
  dgegPerMonth: 70_000, // 0,07 €/month
  largeFamily: false,
};

const tri: TariffInput = {
  ...simple,
  powerVa: 10_350,
  option: 'tri',
  fixedPerDay: 0,
  energy: { peak: 250_000, full: 180_000, empty: 100_000 },
  iecPerKwh: 0,
  cavPerMonth: 0,
  dgegPerMonth: 0,
};

describe('reducedVatWh (docs/electricity-vat.md)', () => {
  it('200 kWh per 30 days up to 6,9 kVA, in proportion to the days', () => {
    expect(reducedVatWh(10_000, 1, simple)).toBe(6_667);
    expect(reducedVatWh(226_000, 31, simple)).toBe(206_667);
    expect(reducedVatWh(150_000, 30, simple)).toBe(150_000);
    expect(reducedVatWh(250_000, 30, { ...simple, largeFamily: true })).toBe(250_000);
    expect(reducedVatWh(250_000, 30, simple)).toBe(200_000);
    expect(reducedVatWh(150_000, 30, { ...simple, powerVa: 10_350 })).toBe(0);
  });
});

describe('electricityCost', () => {
  it('one day of 10 kWh on a simple tariff (calculated by hand)', () => {
    // Energy: 10 × 0,1665 = 1,665 €; VAT 6 % on 6,667 kWh and 23 % on 3,333 kWh:
    //   1,665 × (1 + (6667 × 0,06 + 3333 × 0,23) / 10000) = 1,665 × 1,116661 = 1,8592 → 1,86 €
    // Power: 0,3436 × 1,23 = 0,4226 → 0,42 €
    // Taxes: IEC 0,01 × 1,116661 = 0,0112; CAV 2,85 × 12/365 × 1,06 = 0,0993;
    //        DGEG 0,07 × 12/365 × 1,23 = 0,0028; total 0,1133 → 0,11 €
    expect(electricityCost({ simple: 10_000 }, 1, simple)).toEqual({
      energyCents: 186,
      powerCents: 42,
      taxesCents: 11,
      totalCents: 239,
      reducedWh: 6_667,
    });
  });

  it('tri-hourly prices by period, all at 23 % above 6,9 kVA', () => {
    // 0,5 × 0,25 + 0,3 × 0,18 + 0,3 × 0,10 = 0,209 €; × 1,23 = 0,2571 → 0,26 €
    const cost = electricityCost({ peak: 500, full: 300, empty: 300 }, 1, tri);
    expect(cost).toEqual({
      energyCents: 26,
      powerCents: 0,
      taxesCents: 0,
      totalCents: 26,
      reducedWh: 0,
    });
  });

  it('nothing consumed: only the fixed term and the monthly fees', () => {
    const cost = electricityCost({}, 1, simple);
    expect(cost.energyCents).toBe(0);
    expect(cost.powerCents).toBe(42);
    expect(cost.taxesCents).toBe(10); // 0,0993 + 0,0028
  });

  it('needs a price for every period with consumption', () => {
    expect(() => electricityCost({ empty: 10 }, 1, simple)).toThrow(/No price for empty/);
    expect(() => electricityCost({ simple: 1.5 }, 1, simple)).toThrow(TypeError);
  });
});

describe('energyByPeriod', () => {
  it('adds each quarter hour to its period (winter weekday, daily cycle)', () => {
    const day = startOfLisbonDay('2026-01-14');
    const quarter = (hours: number, minutes: number, energyWh: number) => ({
      ts: day + hours * 3600 + minutes * 60,
      energyWh,
    });
    const quarters = [
      quarter(8, 0, 300),
      quarter(9, 0, 500),
      quarter(23, 0, 200),
      quarter(23, 15, 100),
    ];
    expect(energyByPeriod(quarters, tri)).toEqual({ full: 300, peak: 500, empty: 300 });
    expect(energyByPeriod(quarters, { ...tri, option: 'bi' })).toEqual({
      offEmpty: 800,
      empty: 300,
    });
    expect(energyByPeriod(quarters, simple)).toEqual({ simple: 1100 });
  });
});
