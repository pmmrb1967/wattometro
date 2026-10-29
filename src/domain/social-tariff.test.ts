// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { electricityCost } from './electricity-cost';
import {
  checkSocialTariff,
  hasSocialTariff,
  incomeLimit,
  socialTariffSaving,
} from './social-tariff';
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
  cavPerMonth: 2_850_000,
  dgegPerMonth: 70_000,
  largeFamily: false,
  energyDiscountBp: 0,
  socialEnergyPerKwh: 0,
  socialPowerPerDay: 0,
  socialFinancingPerKwh: 0,
};

describe('incomeLimit (ERSE, October 2026)', () => {
  it('6 272,64 € and 50 % more per member without income, up to 10', () => {
    expect(incomeLimit(0)).toBe(627_264);
    expect(incomeLimit(1)).toBe(940_896);
    expect(incomeLimit(2)).toBe(1_254_528);
    expect(incomeLimit(15)).toBe(incomeLimit(10));
    expect(incomeLimit(-3)).toBe(627_264);
  });
});

describe('checkSocialTariff', () => {
  it('a benefit is enough, whatever the income', () => {
    expect(
      checkSocialTariff({
        benefits: ['old_age'],
        annualIncomeCents: 5_000_000,
        membersWithoutIncome: 0,
      }),
    ).toMatchObject({ eligible: true, reason: 'benefit' });
  });

  it('without benefits, the income against the limit for the household', () => {
    const answers = { benefits: [], membersWithoutIncome: 1 };
    expect(checkSocialTariff({ ...answers, annualIncomeCents: 940_896 })).toMatchObject({
      eligible: true,
      reason: 'income',
    });
    expect(checkSocialTariff({ ...answers, annualIncomeCents: 940_897 }).eligible).toBe(false);
    // No income said: not eligible, the limit is still told.
    expect(checkSocialTariff(answers)).toEqual({ eligible: false, incomeLimitCents: 940_896 });
  });
});

describe('hasSocialTariff', () => {
  it('when the invoice discounts are in the tariff', () => {
    expect(hasSocialTariff(simple)).toBe(false);
    expect(hasSocialTariff({ ...simple, socialEnergyPerKwh: 46_800 })).toBe(true);
  });
});

describe('socialTariffSaving', () => {
  it('33,8 % of energy and power, plus the IEC with its VAT', () => {
    // 3000 kWh a year: IEC 3000 × 0,001 € = 3,00 €, with 23 % VAT 3,69 €.
    const energy = { simple: 3_000_000 };
    const cost = electricityCost(energy, 365, simple);
    const saving = socialTariffSaving(cost, energy, 365, simple);
    expect(saving.iecCents).toBe(369);
    expect(saving.discountCents).toBe(
      Math.round(((cost.energyCents + cost.powerCents) * 338) / 1000),
    );
    expect(saving.totalCents).toBe(saving.discountCents + 369);
  });

  it('by hand: 1000,00 € of energy and power take off 338,00 €', () => {
    const saving = socialTariffSaving(
      { energyCents: 80_000, powerCents: 20_000, taxesCents: 0 },
      {},
      365,
      { ...simple, iecPerKwh: 0, cavPerMonth: 0, dgegPerMonth: 0 },
    );
    expect(saving).toEqual({ discountCents: 33_800, iecCents: 0, totalCents: 33_800 });
  });
});
