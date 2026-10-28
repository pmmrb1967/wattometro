// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  annualUsage,
  compareOffers,
  costWithMoved,
  energyFor,
  withoutTwins,
  type AnnualUsage,
} from './compare';
import { offer } from './offer-fixture';
import type { TariffInput } from './tariff';

const utc = (iso: string) => Date.parse(iso) / 1000;

const current: TariffInput = {
  validFrom: '2026-01-01',
  supplier: 'Atual',
  powerVa: 6900,
  option: 'simple',
  cycle: 'daily',
  periodsMap: 'pre-2027',
  fixedPerDay: 0,
  energy: { simple: 200_000 }, // 0,20 €/kWh
  iecPerKwh: 0,
  cavPerMonth: 0,
  dgegPerMonth: 0,
  largeFamily: false,
  energyDiscountBp: 0,
  socialEnergyPerKwh: 0,
  socialPowerPerDay: 0,
  socialFinancingPerKwh: 0,
};

describe('annualUsage', () => {
  it('30 winter days of 100 Wh per quarter hour, scaled to a year (daily cycle by hand)', () => {
    const quarters = [];
    const start = utc('2026-01-05T00:00:00Z'); // a Monday, winter time (UTC = Lisbon)
    for (let index = 0; index < 30 * 96; index++) {
      quarters.push({ ts: start + index * 900, energyWh: 100 });
    }
    // Daily cycle in winter: empty 22–08 (10 h), peak 09–10:30 and 18–20:30 (4 h), full 10 h.
    // A day: empty 40 × 100 = 4 000 Wh, peak 1 600, full 4 000; a year: × 365.
    const usage = annualUsage(quarters, 'pre-2027');
    expect(usage).toMatchObject({
      totalWh: 3_504_000,
      days: 30,
      extrapolated: true,
    });
    expect(usage?.byCycle.daily).toEqual({ empty: 1_460_000, full: 1_460_000, peak: 584_000 });
  });

  it('needs a month of data', () => {
    expect(
      annualUsage([{ ts: utc('2026-01-05T00:00:00Z'), energyWh: 100 }], 'pre-2027'),
    ).toBeNull();
  });
});

describe('compareOffers', () => {
  // 3 000 kWh a year; the weekly cycle puts more of it in empty than the daily one.
  const usage: AnnualUsage = {
    totalWh: 3_000_000,
    byCycle: {
      daily: { empty: 600_000, full: 1_800_000, peak: 600_000 },
      weekly: { empty: 900_000, full: 1_500_000, peak: 600_000 },
    },
    days: 365,
    extrapolated: false,
  };
  // Same total and power everywhere, so the same VAT multiplier: 6 % on
  // 2 433 333 Wh (365 / 30 × 200 kWh), 23 % on the rest:
  //   m = 1 + (2 433 333 × 6 + 566 667 × 23) / (3 000 000 × 100) = 1,09211113
  const offers = [
    offer('A', { '1': { fixedPerDay: 0, simple: 0.18 } }),
    offer('B', { '2': { fixedPerDay: 0, offEmpty: 0.25, empty: 0.1 } }),
    offer('C', { '1': { fixedPerDay: 0, simple: 0.01 } }, { validFrom: '2099-01-01' }),
    offer('D', {}, { prices: { '10.35': { '1': { fixedPerDay: 0, simple: 0.01 } } } }),
  ];
  const comparison = compareOffers({ usage, current, offers, today: '2026-10-22' });

  it('prices every valid offer at the same power against the current contract', () => {
    // Current: 3 000 × 0,20 = 600 € × m = 655,27 €. A: 540 € × m = 589,74 €.
    // B, weekly (cheaper): 2 100 × 0,25 + 900 × 0,10 = 615 € × m = 671,65 €
    //   (daily would be 2 400 × 0,25 + 600 × 0,10 = 660 €).
    expect(comparison.currentCents).toBe(65_527);
    expect(comparison.currentEnergy).toEqual({ simple: 3_000_000 });
    const { powerCents, energyCents, taxesCents, servicesCents } = comparison.currentCost;
    expect(powerCents + energyCents + taxesCents + servicesCents).toBe(65_527);
    expect(
      comparison.results.map((result) => [
        result.offer.id,
        result.option,
        result.cycle,
        result.annualCents,
        result.savingCents,
      ]),
    ).toEqual([
      ['A', 'simple', 'daily', 58_974, 6_553],
      ['B', 'bi', 'weekly', 67_165, -1_638],
    ]);
  });

  it('keeps the prices and the parts each offer was costed with (B, weekly: by hand above)', () => {
    const b = comparison.results.find((result) => result.offer.id === 'B')!;
    expect(b.energy).toEqual({ offEmpty: 2_100_000, empty: 900_000 });
    expect(b.energyPrices).toEqual({ offEmpty: 250_000, empty: 100_000 });
    const { energyCents, powerCents, taxesCents, servicesCents, totalCents } = b.cost;
    expect(totalCents).toBe(b.annualCents);
    expect(energyCents + powerCents + taxesCents + servicesCents).toBe(totalCents);
  });

  it('says how much to move to empty for bi-hourly to beat the cheapest simple choice', () => {
    // The cheapest simple choice is offer A (589,74 €). Each kWh moved saves
    // (0,25 − 0,10) × m = 0,1638 €; it must save 671,65 − 589,74 = 81,91 €:
    // about 500 kWh a year, out of the 2 100 kWh outside empty.
    const shift = comparison.shift.bi;
    expect(shift?.best.offer.id).toBe('B');
    expect(shift?.targetCents).toBe(58_974);
    expect(shift?.movableWh).toBe(2_100_000);
    expect(Math.abs((shift?.neededWh ?? 0) - 500_000)).toBeLessThan(100);
    expect(comparison.shift.tri).toBeNull();
  });

  it('prices a year with some appliances run in the empty period instead', () => {
    // 500 kWh of the weekly cycle's full and peak moved to empty with offer B:
    // 1 600 × 0,25 + 1 400 × 0,10 = 540 € × m = 589,74 €, as much as offer A.
    const shift = comparison.shift.bi;
    if (!shift) throw new Error('No shift');
    const moved = { empty: 50_000, full: 300_000, peak: 200_000 };
    expect(costWithMoved(shift, usage, current, moved)).toBe(58_974);
    // Never more than the year has: all of full and peak, 3 000 kWh in empty: 300 € × m.
    const everything = { empty: 0, full: 9_000_000, peak: 9_000_000 };
    expect(costWithMoved(shift, usage, current, everything)).toBe(32_763);
  });

  it('splits the year the way each option bills it', () => {
    expect(energyFor('simple', 'daily', usage)).toEqual({ simple: 3_000_000 });
    expect(energyFor('bi', 'weekly', usage)).toEqual({ empty: 900_000, offEmpty: 2_100_000 });
    expect(energyFor('tri', 'daily', usage)).toEqual({
      empty: 600_000,
      full: 1_800_000,
      peak: 600_000,
    });
  });
});

describe('withoutTwins', () => {
  const usage: AnnualUsage = {
    totalWh: 3_000_000,
    byCycle: {
      daily: { empty: 600_000, full: 1_800_000, peak: 600_000 },
      weekly: { empty: 900_000, full: 1_500_000, peak: 600_000 },
    },
    days: 365,
    extrapolated: false,
  };
  const same = { '1': { fixedPerDay: 0, simple: 0.18 } };
  const results = compareOffers({
    usage,
    current,
    today: '2026-10-22',
    offers: [
      offer('D', same, { supplier: 'X', supply: 'DUAL' }),
      offer('E', same, { supplier: 'X' }),
      offer('F', same, { supplier: 'Y' }),
      offer('G', { '1': { fixedPerDay: 0, simple: 0.19 } }, { supplier: 'X', supply: 'DUAL' }),
    ],
  }).results;

  it('shows a dual offer priced as an electricity-only one of the supplier once', () => {
    // D and E: same supplier, option and prices; F another supplier; G dearer.
    expect(withoutTwins(results).map(({ result, alsoGas }) => [result.offer.id, alsoGas])).toEqual([
      ['E', true],
      ['F', false],
      ['G', false],
    ]);
  });
});
