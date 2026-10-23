// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { lisbonDate, nextDate, startOfLisbonDay, type LocalDate } from '../lib/time';
import { baseloadCost, monthlyBaseload, nightlyBaseload, recentBaseload } from './baseload';
import type { TariffInput } from './tariff';

const QUARTER = 900;

/** Every quarter hour of a Lisbon day, with Wh given by its index (0 = 00:00). */
function day(date: LocalDate, wh: (index: number) => number) {
  const start = startOfLisbonDay(date);
  const end = startOfLisbonDay(nextDate(date));
  const quarters = [];
  for (let ts = start, index = 0; ts < end; ts += QUARTER, index++) {
    quarters.push({ ts, energyWh: wh(index) });
  }
  return quarters;
}

describe('nightlyBaseload', () => {
  it('10th percentile of the 00:00–06:00 quarters, in W', () => {
    // 24 night quarters: two at 10 Wh (40 W), the rest at 50 Wh (200 W); the day at 500 Wh.
    // Rank ⌈0,1 × 24⌉ = 3 → the third lowest, 200 W: two odd quarters do not decide it.
    const quarters = day('2026-05-12', (index) => (index < 2 ? 10 : index < 24 ? 50 : 500));
    expect(nightlyBaseload(quarters)).toEqual([{ date: '2026-05-12', watts: 200, quarters: 24 }]);
    // A third low quarter: the third lowest is now 40 W.
    const lower = day('2026-05-12', (index) => (index < 3 ? 10 : index < 24 ? 50 : 500));
    expect(nightlyBaseload(lower)[0]?.watts).toBe(40);
  });

  it('a night needs at least 12 quarters', () => {
    const quarters = day('2026-05-12', () => 30).filter((_, index) => index < 11 || index >= 24);
    expect(nightlyBaseload(quarters)).toEqual([]);
    const enough = day('2026-05-12', () => 30).filter((_, index) => index < 12 || index >= 24);
    expect(nightlyBaseload(enough)).toEqual([{ date: '2026-05-12', watts: 120, quarters: 12 }]);
  });

  it('23 h and 25 h days: the night has 20 and 28 quarters of local time', () => {
    // 29/03/2026 01:00 → 02:00; 25/10/2026 02:00 → 01:00 (Europe/Lisbon).
    const spring = nightlyBaseload(day('2026-03-29', () => 25));
    expect(spring).toEqual([{ date: '2026-03-29', watts: 100, quarters: 20 }]);
    const autumn = nightlyBaseload(day('2026-10-25', () => 25));
    expect(autumn).toEqual([{ date: '2026-10-25', watts: 100, quarters: 28 }]);
  });
});

describe('monthlyBaseload and recentBaseload', () => {
  const night = (date: LocalDate, watts: number) => ({ date, watts, quarters: 24 });

  it('median of the nights of each month', () => {
    expect(
      monthlyBaseload([
        night('2026-04-30', 90),
        night('2026-05-01', 100),
        night('2026-05-02', 300),
        night('2026-05-03', 200),
        night('2026-06-01', 100),
        night('2026-06-02', 151),
      ]),
    ).toEqual([
      { month: '2026-04', watts: 90, nights: 1 },
      { month: '2026-05', watts: 200, nights: 3 },
      // (100 + 151) / 2 = 125,5 → 126.
      { month: '2026-06', watts: 126, nights: 2 },
    ]);
  });

  it('now: the nights of the last 30 days up to the last one', () => {
    // 01/05 is 31 days before 31/05: out; 02/05 to 31/05: in.
    const nights = [night('2026-05-01', 999), night('2026-05-02', 100), night('2026-05-31', 120)];
    expect(recentBaseload(nights)).toEqual({ watts: 110, nights: 2 });
    expect(recentBaseload([])).toBeNull();
  });
});

describe('baseloadCost', () => {
  const tariff: TariffInput = {
    validFrom: '2026-01-01',
    supplier: null,
    // Above 6,9 kVA: no reduced VAT, so 23 % on everything.
    powerVa: 10_350,
    option: 'simple',
    cycle: 'daily',
    periodsMap: 'pre-2027',
    fixedPerDay: 500_000,
    energy: { simple: 200_000 }, // 0,20 €/kWh
    iecPerKwh: 0,
    cavPerMonth: 2_850_000,
    dgegPerMonth: 70_000,
    largeFamily: false,
    energyDiscountBp: 0,
    socialEnergyPerKwh: 0,
    socialPowerPerDay: 0,
    socialFinancingPerKwh: 0,
  };

  it('100 W all year: 876 kWh × 0,20 € × 1,23 ≈ 215,50 €; the power term and fees do not count', () => {
    // 30 days at 100 Wh per quarter (400 W): 3 504 kWh a year; 2 628 kWh without the baseload.
    // 3 504 × 0,2 × 1,23 = 861,98 €; 2 628 × 0,2 × 1,23 = 646,49 € (each rounded): 215,49 €.
    const quarters = Array.from({ length: 30 }, (_, index) =>
      day(lisbonDate(startOfLisbonDay('2026-05-01') + index * 86_400 + 43_200), () => 100),
    ).flat();
    expect(baseloadCost(100, quarters, tariff)).toEqual({ annualWh: 876_000, annualCents: 21_549 });
  });

  it('split by period like the hours of the data (tri-hourly)', () => {
    const tri: TariffInput = {
      ...tariff,
      option: 'tri',
      energy: { peak: 300_000, full: 200_000, empty: 100_000 },
      cavPerMonth: 0,
      dgegPerMonth: 0,
    };
    const quarters = day('2026-05-12', () => 100);
    const result = baseloadCost(100, quarters, tri);
    expect(result?.annualWh).toBe(876_000);
    // Cheaper than at the full price all day, dearer than at the empty price.
    expect(result?.annualCents).toBeGreaterThan(10_775); // 876 × 0,1 × 1,23
    expect(result?.annualCents).toBeLessThan(21_550); // 876 × 0,2 × 1,23
  });

  it('nothing without data or baseload', () => {
    expect(baseloadCost(100, [], tariff)).toBeNull();
    expect(
      baseloadCost(
        0,
        day('2026-05-12', () => 1),
        tariff,
      ),
    ).toBeNull();
  });
});
