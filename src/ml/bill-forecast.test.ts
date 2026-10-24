// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { addDays, monthDates } from '../domain/consumption';
import { electricityCost } from '../domain/electricity-cost';
import type { TariffInput } from '../domain/tariff';
import { lisbonDayLength, nextDate, startOfLisbonDay, type LocalDate } from '../lib/time';
import {
  backtest,
  dayKind,
  fitDailyModel,
  forecastMonth,
  forecastRange,
  prepareForecast,
  spreadDay,
  type BacktestSample,
} from './bill-forecast';

const QUARTER = 900;

const SIMPLE: TariffInput = {
  validFrom: '2020-01-01',
  supplier: '',
  powerVa: 6900,
  option: 'simple',
  cycle: 'daily',
  periodsMap: 'pre-2027',
  fixedPerDay: 400_000,
  energy: { simple: 150_000 },
  iecPerKwh: 1_000,
  cavPerMonth: 2_850_000,
  dgegPerMonth: 70_000,
  largeFamily: false,
  energyDiscountBp: 0,
  socialEnergyPerKwh: 0,
  socialPowerPerDay: 0,
  socialFinancingPerKwh: 0,
};

/** Every quarter of a Lisbon day with the same Wh (the day's total = wh × quarters). */
function flatDay(date: LocalDate, whPerQuarter: number) {
  const start = startOfLisbonDay(date);
  const count = lisbonDayLength(date) / QUARTER;
  return Array.from({ length: count }, (_, index) => ({
    ts: start + index * QUARTER,
    energyWh: whPerQuarter,
  }));
}

function days(from: LocalDate, count: number, whPerQuarter: (date: LocalDate) => number) {
  const quarters = [];
  for (let date = from, index = 0; index < count; date = nextDate(date), index++) {
    quarters.push(...flatDay(date, whPerQuarter(date)));
  }
  return quarters;
}

describe('dayKind', () => {
  it('workdays, Saturdays, and Sundays with the public holidays', () => {
    expect(dayKind('2026-10-21')).toBe('workday'); // Wednesday
    expect(dayKind('2026-10-24')).toBe('saturday');
    expect(dayKind('2026-10-25')).toBe('sunday');
    expect(dayKind('2026-10-05')).toBe('sunday'); // Monday, a holiday
  });
});

describe('spreadDay', () => {
  it('spreads whole Wh by the shape and sums exactly', () => {
    const shape = new Array<number>(96).fill(0);
    shape[0] = 1;
    shape[1] = 2;
    const quarters = spreadDay('2026-03-10', 10, shape);
    expect(quarters).toHaveLength(96);
    // 10 × 1/3 = 3,33 → 3; 10 × 2/3 = 6,67 → 6 + the one Wh left (largest remainder).
    expect(quarters.slice(0, 2).map((q) => q.energyWh)).toEqual([3, 7]);
    expect(quarters.reduce((sum, q) => sum + q.energyWh, 0)).toBe(10);
  });

  it('the 25 h day has 100 quarters; the extra hour takes the last slot of the shape', () => {
    const quarters = spreadDay('2026-10-25', 1000, new Array<number>(96).fill(1 / 96));
    expect(quarters).toHaveLength(100);
    expect(quarters[0]?.ts).toBe(startOfLisbonDay('2026-10-25'));
    expect(quarters.reduce((sum, q) => sum + q.energyWh, 0)).toBe(1000);
  });
});

describe('prepareForecast', () => {
  it('days by Lisbon date; a day missing quarters is not complete', () => {
    const quarters = [
      ...flatDay('2026-10-24', 10),
      ...flatDay('2026-10-25', 10).slice(0, 96), // 25 h day as E-Redes sends it: 4 missing, complete
      ...flatDay('2026-10-26', 10).slice(0, 50),
    ];
    const data = prepareForecast(quarters, null);
    expect([...data.days.keys()]).toEqual(['2026-10-24', '2026-10-25', '2026-10-26']);
    expect(data.days.get('2026-10-24')).toMatchObject({ wh: 960, complete: true });
    expect(data.days.get('2026-10-25')).toMatchObject({ wh: 960, complete: true });
    expect(data.days.get('2026-10-26')).toMatchObject({ wh: 500, complete: false });
  });
});

describe('forecastMonth', () => {
  it('measured days count as they are; the rest is forecast; cost by the engine', () => {
    // 100 Wh per quarter = 9600 Wh per day, up to 10 June (102 days from 1 March); forecast
    // made on 11 June with the naive baseline (no 23 h or 25 h day among its 28 days).
    const data = prepareForecast(
      days('2026-03-01', 102, () => 100),
      SIMPLE,
    );
    const forecast = forecastMonth(data, '2026-06', '2026-06-11', () => null, 'naive');
    expect(forecast?.knownDays).toBe(10);
    expect(forecast?.knownWh).toBe(96_000);
    expect(forecast?.forecastWh).toBe(20 * 9600);
    expect(forecast?.totalWh).toBe(30 * 9600);
    expect(forecast?.costCents).toBe(electricityCost({ simple: 288_000 }, 30, SIMPLE).totalCents);
    expect(forecast?.spentCents).toBe(electricityCost({ simple: 96_000 }, 10, SIMPLE).totalCents);
    expect(forecast?.days.filter((day) => day.known)).toHaveLength(10);
  });

  it('days E-Redes has not sent yet are forecast, not left out', () => {
    // Data up to 7 June; forecast on 11 June: 8, 9 and 10 June are forecast.
    const data = prepareForecast(
      days('2026-03-01', 99, () => 100),
      SIMPLE,
    );
    const forecast = forecastMonth(data, '2026-06', '2026-06-11', () => null, 'naive');
    expect(forecast?.knownDays).toBe(7);
    expect(forecast?.totalWh).toBe(30 * 9600);
  });

  it('too few days: no forecast', () => {
    const data = prepareForecast(
      days('2026-11-01', 3, () => 100),
      SIMPLE,
    );
    expect(forecastMonth(data, '2026-11', '2026-11-04', () => null)).toBeNull();
  });
});

// ---- A synthetic household: kind of day, heating below 16 °C, noise ----

/** Deterministic pseudo-random numbers in [0, 1). */
function random(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

function syntheticHouse(from: LocalDate, count: number) {
  const next = random(42);
  const temperature = new Map<LocalDate, number>();
  const quarters: { ts: number; energyWh: number }[] = [];
  for (let date = from, index = 0; index < count; date = nextDate(date), index++) {
    const dayOfYear =
      (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${date.slice(0, 4)}-01-01`)) / 86_400_000;
    // Mean °C: 8 in mid-January, 22 in mid-July, ± a few degrees of weather.
    const tenths = Math.round(
      150 - 70 * Math.cos((2 * Math.PI * (dayOfYear - 15)) / 365) + (next() - 0.5) * 60,
    );
    temperature.set(date, tenths);
    const kind = dayKind(date);
    const base = kind === 'workday' ? 7000 : kind === 'saturday' ? 9000 : 10_000;
    const heating = Math.max(0, 160 - tenths) * 80; // 800 Wh per degree-day
    const wh = Math.round((base + heating) * (0.92 + next() * 0.16));
    const start = startOfLisbonDay(date);
    const length = lisbonDayLength(date) / QUARTER;
    // Twice as much in the evening (18:00–22:00) as at other times.
    const weights = Array.from({ length }, (_, q) => (q >= 72 && q < 88 ? 2 : 1));
    const sum = weights.reduce((a, b) => a + b, 0);
    let left = wh;
    weights.forEach((weight, q) => {
      const energyWh = q === length - 1 ? left : Math.floor((wh * weight) / sum);
      left -= energyWh;
      quarters.push({ ts: start + q * QUARTER, energyWh });
    });
  }
  return { quarters, temperature };
}

describe('the synthetic household', () => {
  const { quarters, temperature } = syntheticHouse('2025-01-01', 730);
  const measured = (date: LocalDate) => temperature.get(date) ?? null;

  it('the model finds the heating and the kind of day', () => {
    const data = prepareForecast(quarters, null);
    const model = fitDailyModel(data, '2026-06-01', measured);
    expect(model?.usesTemperature).toBe(true);
    // A cold workday (8 °C: 8 degree-days × 800 = 6400) and a mild Sunday (18 °C).
    expect(model?.predict('2026-06-03', 80)).toBeGreaterThan(7000 + 6400 - 800);
    expect(model?.predict('2026-06-03', 80)).toBeLessThan(7000 + 6400 + 800);
    expect(model?.predict('2026-06-07', 180)).toBeGreaterThan(10_000 - 800);
    expect(model?.predict('2026-06-07', 180)).toBeLessThan(10_000 + 800);
  });

  it('backtest: the model beats the naive baseline (the acceptance criterion)', () => {
    const data = prepareForecast(quarters, SIMPLE);
    // The usual temperature: the sine without the weather.
    const normal = (date: LocalDate) => {
      const dayOfYear =
        (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${date.slice(0, 4)}-01-01`)) / 86_400_000;
      return Math.round(150 - 70 * Math.cos((2 * Math.PI * (dayOfYear - 15)) / 365));
    };
    const result = backtest(data, '2027-01', measured, normal);
    expect(result.unit).toBe('cents');
    // Months from February 2025 (28 training days) to December 2026, 5 days each.
    expect(result.samples.length).toBeGreaterThan(80);
    expect(result.modelErrorPct).not.toBeNull();
    expect(result.modelErrorPct!).toBeLessThan(result.naiveErrorPct!);
    expect(result.modelErrorPct!).toBeLessThan(5);
  });

  it('a month of the past, forecast on day 15, lands near what it cost', () => {
    const data = prepareForecast(quarters, SIMPLE);
    const forecast = forecastMonth(data, '2026-01', '2026-01-15', measured);
    const january = monthDates('2026-01');
    const actualWh = january.reduce((sum, date) => sum + (data.days.get(date)?.wh ?? 0), 0);
    expect(forecast?.method).toBe('model');
    expect(Math.abs(forecast!.totalWh - actualWh) / actualWh).toBeLessThan(0.05);
    expect(forecast?.knownDays).toBe(14);
    expect(addDays('2026-01-15', -14)).toBe('2026-01-01');
  });
});

describe('forecastRange', () => {
  const sample = (day: number, model: number): BacktestSample => ({
    month: '2026-01',
    day,
    actual: 100,
    model,
    naive: 100,
  });

  it('from the errors of past forecasts made nearest the same day', () => {
    // Day 12 → forecasts made on day 10: ratios −0,1, 0, 0, +0,1, +0,2 (sorted).
    const samples = [90, 100, 100, 110, 120].map((model) => sample(10, model));
    samples.push(sample(25, 300)); // another day: ignored
    // P10 = −0,1 + 0,4 × 0,1 = −0,06; P90 = 0,1 + 0,6 × 0,1 = 0,16.
    expect(forecastRange(1000, 12, samples)).toEqual({
      low: Math.round(1000 / 1.16),
      high: Math.round(1000 / 0.94),
    });
  });

  it('too few samples: no range', () => {
    expect(forecastRange(1000, 10, [sample(10, 100), sample(10, 110)])).toBeNull();
  });
});
