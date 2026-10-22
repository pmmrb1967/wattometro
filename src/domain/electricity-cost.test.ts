// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { startOfLisbonDay } from '../lib/time';
import { electricityCost, energyByPeriod, reducedVatWh } from './electricity-cost';
import { tariffInputSchema, type TariffInput } from './tariff';

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
  energyDiscountBp: 0,
  socialEnergyPerKwh: 0,
  socialPowerPerDay: 0,
  socialFinancingPerKwh: 0,
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
      servicesCents: 0,
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
      servicesCents: 0,
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

describe('electricityCost with discounts and the tarifa social', () => {
  it('30 days of 300 kWh (calculated by hand)', () => {
    const tariff: TariffInput = {
      ...simple,
      fixedPerDay: 500_000, // 0,50 €/day
      energy: { simple: 200_000 }, // 0,20 €/kWh
      iecPerKwh: 0,
      cavPerMonth: 0,
      dgegPerMonth: 0,
      energyDiscountBp: 500, // 5 %
      socialEnergyPerKwh: 50_000, // 0,05 €/kWh
      socialPowerPerDay: 200_000, // 0,20 €/day
      socialFinancingPerKwh: 2_000, // 0,002 €/kWh
    };
    // Energy: 300 × 0,20 = 60 €; − 5 % = 57 €; + 300 × (0,002 − 0,05) = −14,40 € → 42,60 €
    //   VAT 6 % on 200 kWh, 23 % on 100 kWh: 42,60 × (1 + 3500 / 30000) = 47,57 €
    // Power: (0,50 − 0,20) × 30 = 9 € × 1,23 = 11,07 €
    expect(electricityCost({ simple: 300_000 }, 30, tariff)).toEqual({
      energyCents: 4757,
      powerCents: 1107,
      taxesCents: 0,
      servicesCents: 0,
      totalCents: 5864,
      reducedWh: 200_000,
    });
  });
});

describe('electricityCost with the terms of an ERSE offer', () => {
  it('30 days of 300 kWh (calculated by hand)', () => {
    const tariff: TariffInput = {
      ...simple,
      fixedPerDay: 500_000, // 0,50 €/day
      energy: { simple: 200_000 }, // 0,20 €/kWh
      iecPerKwh: 0,
      cavPerMonth: 0,
      dgegPerMonth: 0,
    };
    const terms = {
      fixedDiscountBp: 1_000, // 10 %
      energyDiscountPerKwh: 10_000, // 0,01 €/kWh
      discountPerYear: 36_500_000, // 36,50 €/year = 0,10 €/day
      servicesPerYearCents: 1_200, // 12 €/year with VAT
    };
    // Energy: 300 × 0,20 − 300 × 0,01 = 57 € × (1 + 3500 / 30000) = 63,65 €
    // Power: 0,50 × 30 = 15 € − 10 % − 30 × 0,10 = 10,50 € × 1,23 = 12,915 → 12,92 €
    // Services: 12 × 30 / 365 = 0,986 → 0,99 €
    expect(electricityCost({ simple: 300_000 }, 30, tariff, terms)).toEqual({
      energyCents: 6365,
      powerCents: 1292,
      taxesCents: 0,
      servicesCents: 99,
      totalCents: 7756,
      reducedWh: 200_000,
    });
  });
});

// Real invoices (fixtures/private, local only): the estimate must match the invoice total.
const REAL = join(__dirname, '..', '..', 'fixtures', 'private', 'repsol-electricity-invoices.json');
const realInvoices = existsSync(REAL)
  ? (
      JSON.parse(readFileSync(REAL, 'utf8')) as {
        invoices: {
          file: string;
          days: number;
          energyWh: Record<string, number>;
          tariff: unknown;
          invoice: { totalCents: number };
        }[];
      }
    ).invoices
  : [];

describe.skipIf(realInvoices.length === 0)('electricityCost against real invoices', () => {
  it.each(realInvoices)('$file: within 2 cents of the invoice', (invoice) => {
    const tariff = tariffInputSchema.parse(invoice.tariff);
    const cost = electricityCost(invoice.energyWh, invoice.days, tariff);
    expect(Math.abs(cost.totalCents - invoice.invoice.totalCents)).toBeLessThanOrEqual(2);
  });
});
