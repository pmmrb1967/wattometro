// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { nextDate, startOfLisbonDay, type LocalDate } from '../lib/time';
import { monthDates } from './consumption';
import { monthlyReport, reportMonths } from './monthly-report';
import type { TariffInput } from './tariff';

function day(date: LocalDate, wh: (index: number) => number) {
  const quarters = [];
  const end = startOfLisbonDay(nextDate(date));
  for (let ts = startOfLisbonDay(date), index = 0; ts < end; ts += 900, index++) {
    quarters.push({ ts, energyWh: wh(index) });
  }
  return quarters;
}

const month = (yearMonth: string, wh: number, days = 31) =>
  monthDates(yearMonth)
    .slice(0, days)
    .flatMap((date) => day(date, () => wh));

const simple: TariffInput = {
  validFrom: '2025-01-01',
  supplier: null,
  // Above 6,9 kVA: 23 % VAT on everything.
  powerVa: 10_350,
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

describe('monthlyReport', () => {
  // May 2026 at 100 W all the time; April 2026 and May 2025 at 80 W.
  const quarters = [...month('2025-05', 20), ...month('2026-04', 20), ...month('2026-05', 25)];

  it('consumption, comparisons per day, cost, baseload and the highest quarter', () => {
    const report = monthlyReport(quarters, '2026-05', simple);
    // 31 days × 96 × 25 Wh = 74,4 kWh; 2,4 kWh per day.
    expect(report?.usage).toEqual({
      month: '2026-05',
      totalWh: 74_400,
      daysWithData: 31,
      days: 31,
      perDayWh: 2_400,
    });
    // 1,92 kWh per day before: +25 %.
    expect(report?.vsPrevious).toBe(25);
    expect(report?.vsLastYear).toBe(25);
    // 74,4 kWh × 0,20 € × 1,23 = 18,30 €.
    expect(report?.cost?.totalCents).toBe(1_830);
    // All of it is baseload: 876 kWh a year = 215,50 €; × 31 / 365 = 18,30 €.
    expect(report?.baseload).toEqual({ watts: 100, nights: 31, cents: 1_830 });
    expect(report?.peak).toEqual({ ts: startOfLisbonDay('2026-05-01'), watts: 100 });
    expect(report?.suggestions).toEqual([
      { kind: 'baseload', pct: 100, watts: 100 },
      { kind: 'higherThanLastYear', pct: 25 },
      { kind: 'lowPeak', peakWatts: 100, powerVa: 10_350 },
      { kind: 'simpleTariff' },
    ]);
  });

  it('missing days: compared per day, cost for the days with data', () => {
    const partial = [...month('2026-04', 25), ...month('2026-05', 25, 10)];
    const report = monthlyReport(partial, '2026-05', simple);
    expect(report?.usage.daysWithData).toBe(10);
    expect(report?.usage.days).toBe(31);
    expect(report?.vsPrevious).toBe(0);
    expect(report?.vsLastYear).toBeNull();
    // 24 kWh × 0,20 × 1,23 = 5,90 €.
    expect(report?.cost?.totalCents).toBe(590);
  });

  it('tri-hourly: share of the peak period', () => {
    // 40 Wh per quarter from 18:00 to 21:00, 1 Wh otherwise: 564 Wh a day. Peak in the winter
    // daily cycle: 09:00–10:30 (6 × 1 Wh) and 18:00–20:30 (10 × 40 Wh): 406 Wh, 72 %.
    const tri: TariffInput = {
      ...simple,
      option: 'tri',
      energy: { empty: 100_000, full: 200_000, peak: 300_000 },
    };
    const evenings = monthDates('2026-01').flatMap((date) =>
      day(date, (index) => (index >= 72 && index < 84 ? 40 : 1)),
    );
    const report = monthlyReport(evenings, '2026-01', tri);
    expect(report?.suggestions).toContainEqual({ kind: 'peak', pct: 72 });
    expect(report?.suggestions.some((suggestion) => suggestion.kind === 'simpleTariff')).toBe(
      false,
    );
  });

  it('nothing for a month without data', () => {
    expect(monthlyReport(quarters, '2026-06', simple)).toBeNull();
  });
});

describe('reportMonths', () => {
  it('months with data, newest first', () => {
    const quarters = [...day('2026-04-30', () => 1), ...day('2026-05-01', () => 1)];
    expect(reportMonths(quarters)).toEqual(['2026-05', '2026-04']);
  });
});
