// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { startOfLisbonDay } from '../lib/time';
import { annualUsage, compareOffers } from './compare';
import { dynamicAdjust, indexedKind, profileEffect } from './indexed';
import { offer } from './offer-fixture';
import type { OmieFile } from './omie';
import type { TariffInput } from './tariff';

const START = startOfLisbonDay('2026-01-05'); // Winter: Lisbon is UTC.
const DAYS = 30;

/**
 * 30 days: from 00:00 to 12:00 the market is at 60 €/MWh and the house uses
 * 100 Wh per quarter hour; from 12:00 to 24:00, 120 €/MWh and 300 Wh.
 * Plain average: 90 €/MWh. The house's: (100 × 60 + 300 × 120) / 400 = 105 €/MWh.
 * Effect: +15 €/MWh = +0,015 €/kWh = 15 000 µ€/kWh.
 */
function household() {
  const quarters: { ts: number; energyWh: number }[] = [];
  const prices: number[] = [];
  for (let i = 0; i < DAYS * 96; i++) {
    const night = i % 96 < 48;
    quarters.push({ ts: START + i * 900, energyWh: night ? 100 : 300 });
    prices.push(night ? 6000 : 12000);
  }
  const omie: OmieFile = { schemaVersion: 1, source: 't', fetchedAt: 't', start: START, prices };
  return { quarters, omie };
}

const current: TariffInput = {
  validFrom: '2026-01-01',
  supplier: 'Atual',
  powerVa: 6900,
  option: 'simple',
  cycle: 'daily',
  periodsMap: 'pre-2027',
  fixedPerDay: 0,
  energy: { simple: 200_000 },
  iecPerKwh: 0,
  cavPerMonth: 0,
  dgegPerMonth: 0,
  largeFamily: false,
  energyDiscountBp: 0,
  socialEnergyPerKwh: 0,
  socialPowerPerDay: 0,
  socialFinancingPerKwh: 0,
};

describe('profileEffect', () => {
  it('the house pays its consumption-weighted OMIE price, not the plain average (by hand)', () => {
    const { quarters, omie } = household();
    const effect = profileEffect(quarters, omie, 'pre-2027')!;
    expect(effect.quarters).toBe(DAYS * 96);
    expect(effect.weighted).toBe(10500);
    expect(effect.average).toBe(9000);
    expect(effect.adjust('simple', 'daily')).toEqual({ simple: 15_000 });
    expect(effect.months).toEqual([{ month: '2026-01', average: 9000 }]);
  });

  it('with consumption flat across the day, the effect is zero in every period', () => {
    const { quarters, omie } = household();
    const flat = quarters.map(({ ts }) => ({ ts, energyWh: 200 }));
    const effect = profileEffect(flat, omie, 'pre-2027')!;
    expect(effect.adjust('simple', 'daily')).toEqual({ simple: 0 });
    expect(effect.adjust('bi', 'daily')).toEqual({ empty: 0, offEmpty: 0 });
    expect(effect.adjust('tri', 'weekly')).toEqual({ empty: 0, full: 0, peak: 0 });
  });

  it('says nothing with less than a month priced', () => {
    const { quarters, omie } = household();
    expect(profileEffect(quarters.slice(0, 29 * 96), omie, 'pre-2027')).toBeNull();
    const later = { ...omie, start: START + DAYS * 86400 };
    expect(profileEffect(quarters, later, 'pre-2027')).toBeNull();
  });
});

describe('indexed offers', () => {
  const prices = { '1': { fixedPerDay: 0, simple: 0.1 } };
  const dynamic = offer('1', prices, {
    supplier: 'COOP',
    name: 'Coopérnico ÚNICO',
    indexedPrices: true,
  });
  const average = offer('2', prices, {
    supplier: 'EDPC',
    name: 'Eletricidade Indexada média DD',
    indexedPrices: true,
  });
  const unknown = offer('3', prices, {
    supplier: 'LUZBOA',
    name: 'LUZBOA SPOTDEF',
    indexedPrices: true,
  });
  const fixed = offer('4', prices, { supplier: 'COOP', name: 'Coopérnico ÚNICO' });

  it('are dynamic or average as their formula says (src/data/indexed-offers.json)', () => {
    expect(indexedKind(dynamic)).toBe('dynamic');
    expect(indexedKind(average)).toBe('average');
    expect(indexedKind(unknown)).toBeNull();
    expect(indexedKind(fixed)).toBeNull();
  });

  it('only a dynamic offer costs the profile effect more: 0,115 instead of 0,100 €/kWh', () => {
    const { quarters, omie } = household();
    const usage = annualUsage(quarters, 'pre-2027')!;
    const adjust = dynamicAdjust(profileEffect(quarters, omie, 'pre-2027'));
    const offers = [dynamic, average, unknown, fixed];
    const plain = compareOffers({ usage, current, offers, today: '2026-10-27' });
    const adjusted = compareOffers({ usage, current, offers, today: '2026-10-27', adjust });
    const find = (comparison: typeof plain, id: string) =>
      comparison.results.find((result) => result.offer.id === id)!;
    // 19,2 kWh a day for a year: 7008 kWh. The energy differs by 7008 × 0,015 = 105,12 € before VAT.
    expect(usage.totalWh).toBe(7_008_000);
    const vatOf = (id: string) => find(adjusted, id).annualCents - find(plain, id).annualCents;
    expect(vatOf('1')).toBeGreaterThanOrEqual(10_512);
    expect(vatOf('1')).toBeLessThanOrEqual(Math.round(10_512 * 1.23));
    expect(find(adjusted, '1').adjusted).toBe(true);
    for (const id of ['2', '3', '4']) {
      expect(find(adjusted, id).annualCents).toBe(find(plain, id).annualCents);
      expect(find(adjusted, id).adjusted).toBe(false);
    }
  });
});
