// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The bill of a month before it ends: the cost of the days already measured
 * plus a forecast of the remaining days (including the days E-Redes has not
 * sent yet), priced with the household's tariff by the cost engine.
 *
 * Model of the energy of a day (weighted least squares, recent days weigh more):
 *   Wh = a + b·saturday + c·sunday-or-holiday + h·HDD + k·CDD
 * with heating/cooling degree-days HDD = max(0, Th − T), CDD = max(0, T − Tc)
 * from the day's mean temperature; Th and Tc are those that fit best. Without
 * enough temperatures the model uses the type of day only. The energy of a
 * forecast day is spread over its quarter hours like the recent days of the
 * same type, so the tariff periods (and their prices) come out right.
 *
 * Naive baseline, for comparison: the average day of the last 28 days.
 * Backtest: the same forecast made on past months at days 5, 10, 15, 20 and 25,
 * with the usual temperature (not the real one) for the days still to come,
 * as the forecast only covers 16 days.
 */
import type { Cents } from '../lib/money';
import {
  lisbonDayLength,
  nextDate,
  startOfLisbonDay,
  QUARTER_HOUR,
  type EpochSeconds,
  type LocalDate,
} from '../lib/time';
import type { TenthsCelsius, Wh } from '../lib/units';
import { addDays, monthDates, weekdayOf } from '../domain/consumption';
import { electricityCost, type EnergyByPeriod } from '../domain/electricity-cost';
import { isHoliday } from '../domain/holidays';
import type { BillingPeriod, TariffInput } from '../domain/tariff';
import { dayBillingPeriods } from '../domain/time-cycles';
import { weightedLeastSquares } from './regression';

type Quarter = { ts: EpochSeconds; energyWh: Wh };

/** Days used to fit the model, before the day of the forecast. */
export const TRAIN_DAYS = 365;
/** Fewer complete days than this: the naive baseline instead of the model. */
export const MIN_TRAIN_DAYS = 28;
/** Days with a temperature needed to use it. */
export const MIN_TEMPERATURE_DAYS = 60;
/** A day this many days old weighs half as much as today. */
export const HALF_LIFE_DAYS = 120;
/** The naive baseline: the average of the complete days among the last 28. */
export const NAIVE_DAYS = 28;
const MIN_NAIVE_DAYS = 7;
/** Recent days whose shape (energy by quarter hour) spreads a forecast day. */
export const PROFILE_DAYS = 56;
/** Thresholds tried for heating and cooling degree-days, tenths of °C. */
const HEATING_BASES = [120, 130, 140, 150, 160, 170, 180, 190, 200];
const COOLING_BASES = [200, 210, 220, 230, 240, 250, 260];
/** A day missing at most this many quarters is complete (E-Redes leaves 4 out on the 25 h day). */
const MAX_MISSING_QUARTERS = 4;

export type DayKind = 'workday' | 'saturday' | 'sunday';

/** Sundays and public holidays use like a Sunday (docs/holidays.md). */
export function dayKind(date: LocalDate): DayKind {
  const weekday = weekdayOf(date);
  if (weekday === 6 || isHoliday(date)) return 'sunday';
  return weekday === 5 ? 'saturday' : 'workday';
}

interface Day {
  date: LocalDate;
  start: EpochSeconds;
  wh: Wh;
  quarters: Quarter[];
  complete: boolean;
}

/** Temperature of a date (tenths of °C), or null. */
export type TemperatureOf = (date: LocalDate) => TenthsCelsius | null;

/**
 * What the forecast needs, prepared once: the days with data and a memory of
 * the tariff periods of each day (the backtest prices the same days many times).
 */
export interface ForecastData {
  days: Map<LocalDate, Day>;
  tariff: TariffInput | null;
  /** The billing period of each quarter hour of a day, in order. */
  periodsOf: (date: LocalDate) => readonly BillingPeriod[];
}

export function prepareForecast(
  quarters: readonly Quarter[],
  tariff: TariffInput | null,
): ForecastData {
  const days = new Map<LocalDate, Day>();
  const sorted = [...quarters].sort((a, b) => a.ts - b.ts);
  let current: Day | null = null;
  let end = 0;
  for (const quarter of sorted) {
    if (!current || quarter.ts >= end) {
      // Find the Lisbon day by its start (no Intl call per quarter).
      let date: LocalDate = current ? nextDate(current.date) : lisbonDateOf(quarter.ts);
      while (startOfLisbonDay(nextDate(date)) <= quarter.ts) date = nextDate(date);
      current = { date, start: startOfLisbonDay(date), wh: 0, quarters: [], complete: false };
      end = startOfLisbonDay(nextDate(date));
      days.set(date, current);
    }
    current.wh += quarter.energyWh;
    current.quarters.push(quarter);
  }
  for (const day of days.values()) {
    const expected = lisbonDayLength(day.date) / QUARTER_HOUR;
    day.complete = day.quarters.length >= expected - MAX_MISSING_QUARTERS;
  }
  const cache = new Map<LocalDate, BillingPeriod[]>();
  const periodsOf = (date: LocalDate) => {
    let periods = cache.get(date);
    if (!periods) {
      periods = tariff
        ? dayBillingPeriods(date, tariff.option, tariff.cycle, tariff.periodsMap)
        : dayBillingPeriods(date, 'simple', 'daily', 'pre-2027');
      cache.set(date, periods);
    }
    return periods;
  };
  return { days, tariff, periodsOf };
}

/** The UTC date: the Lisbon date is the same or the next (UTC+0/+1); the caller moves on. */
function lisbonDateOf(ts: EpochSeconds): LocalDate {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

/** The fitted model of daily energy. */
export interface DailyModel {
  predict: (date: LocalDate, tenths: TenthsCelsius | null) => number;
  usesTemperature: boolean;
}

interface TrainingDay {
  kind: DayKind;
  wh: number;
  weight: number;
  tenths: TenthsCelsius | null;
}

/** The columns of the model: an intercept, a level per kind of day, degree-days. */
interface Design {
  kinds: readonly DayKind[];
  /** Base temperatures (tenths of °C), or null without that term. */
  heating: number | null;
  cooling: number | null;
}

/** Heating and cooling degree-days of a mean temperature (°C·day). */
function degreeDays(design: Design, tenths: TenthsCelsius): [number, number] {
  return [
    design.heating === null ? 0 : Math.max(0, design.heating - tenths) / 10,
    design.cooling === null ? 0 : Math.max(0, tenths - design.cooling) / 10,
  ];
}

function row(design: Design, kind: DayKind, [hdd, cdd]: [number, number]): number[] {
  const values = [1];
  for (const k of design.kinds) values.push(k === kind ? 1 : 0);
  if (design.heating !== null) values.push(hdd);
  if (design.cooling !== null) values.push(cdd);
  return values;
}

/** Coefficients and weighted squared error; null if singular or a degree-day term is negative. */
function fit(design: Design, days: readonly TrainingDay[]) {
  const rows = days.map((day) =>
    row(design, day.kind, day.tenths === null ? [0, 0] : degreeDays(design, day.tenths)),
  );
  const beta = weightedLeastSquares(
    rows,
    days.map((day) => day.wh),
    days.map((day) => day.weight),
  );
  // Heating or cooling that lowers consumption makes no sense: that base is not used.
  if (!beta || beta.slice(1 + design.kinds.length).some((value) => value < 0)) return null;
  let sse = 0;
  rows.forEach((values, index) => {
    const day = days[index]!;
    let predicted = 0;
    for (let j = 0; j < values.length; j++) predicted += values[j]! * beta[j]!;
    sse += day.weight * (predicted - day.wh) ** 2;
  });
  return { design, beta, sse };
}

/** Fits the model on the complete days in [asOf − TRAIN_DAYS, asOf); null with too few. */
export function fitDailyModel(
  data: ForecastData,
  asOf: LocalDate,
  temperatureOf: TemperatureOf,
): DailyModel | null {
  const training: TrainingDay[] = [];
  let date = addDays(asOf, -TRAIN_DAYS);
  for (let age = TRAIN_DAYS; date < asOf; date = nextDate(date), age--) {
    const day = data.days.get(date);
    if (!day?.complete) continue;
    training.push({
      kind: dayKind(date),
      wh: day.wh,
      weight: 0.5 ** (age / HALF_LIFE_DAYS),
      tenths: temperatureOf(date),
    });
  }
  if (training.length < MIN_TRAIN_DAYS) return null;

  // A kind of day without any training day gets no column (it uses the workday level).
  const kinds = (['saturday', 'sunday'] as const).filter((kind) =>
    training.some((day) => day.kind === kind),
  );
  let best = fit({ kinds, heating: null, cooling: null }, training);
  if (!best) return null;
  let usesTemperature = false;

  const withTemperature = training.filter((day) => day.tenths !== null);
  if (withTemperature.length >= MIN_TEMPERATURE_DAYS) {
    // The heating base that fits best, then the cooling base with it (and without heating).
    let warm: ReturnType<typeof fit> = null;
    for (const heating of HEATING_BASES) {
      const result = fit({ kinds, heating, cooling: null }, withTemperature);
      if (result && (!warm || result.sse < warm.sse)) warm = result;
    }
    let found = warm;
    for (const cooling of COOLING_BASES) {
      for (const heating of [warm?.design.heating ?? null, null]) {
        const result = fit({ kinds, heating, cooling }, withTemperature);
        if (result && (!found || result.sse < found.sse)) found = result;
      }
    }
    if (found) {
      best = found;
      usesTemperature = true;
    }
  }

  const chosen = best;
  // Average degree-days of the training, for a day without a temperature.
  const mean: [number, number] = [0, 0];
  if (usesTemperature) {
    for (const day of withTemperature) {
      const [hdd, cdd] = degreeDays(chosen.design, day.tenths!);
      mean[0] += hdd / withTemperature.length;
      mean[1] += cdd / withTemperature.length;
    }
  }
  return {
    predict: (date, tenths) => {
      const values = row(
        chosen.design,
        dayKind(date),
        tenths === null ? mean : degreeDays(chosen.design, tenths),
      );
      let wh = 0;
      for (let j = 0; j < values.length; j++) wh += values[j]! * chosen.beta[j]!;
      return Math.max(0, wh);
    },
    usesTemperature,
  };
}

/** The naive baseline: average complete day among the NAIVE_DAYS before asOf. */
export function naiveModel(data: ForecastData, asOf: LocalDate): DailyModel | null {
  let sum = 0;
  let count = 0;
  for (let date = addDays(asOf, -NAIVE_DAYS); date < asOf; date = nextDate(date)) {
    const day = data.days.get(date);
    if (!day?.complete) continue;
    sum += day.wh;
    count++;
  }
  if (count < MIN_NAIVE_DAYS) return null;
  const mean = sum / count;
  return { predict: () => mean, usesTemperature: false };
}

/** Index of a quarter hour within its Lisbon day (0 = 00:00; up to 99 on the 25 h day). */
const slotOf = (ts: EpochSeconds, dayStart: EpochSeconds) =>
  Math.min(95, Math.floor((ts - dayStart) / QUARTER_HOUR));

/**
 * The share of a day's energy in each of its 96 quarter hours, for each kind of
 * day, from the complete days among the PROFILE_DAYS before asOf. A kind
 * without days uses all days; without any, a flat day.
 */
function dayShapes(data: ForecastData, asOf: LocalDate): Record<DayKind, number[]> {
  const sums: Record<DayKind | 'all', number[]> = {
    workday: new Array<number>(96).fill(0),
    saturday: new Array<number>(96).fill(0),
    sunday: new Array<number>(96).fill(0),
    all: new Array<number>(96).fill(0),
  };
  for (let date = addDays(asOf, -PROFILE_DAYS); date < asOf; date = nextDate(date)) {
    const day = data.days.get(date);
    if (!day?.complete) continue;
    const kind = dayKind(date);
    for (const { ts, energyWh } of day.quarters) {
      const slot = slotOf(ts, day.start);
      sums[kind][slot]! += energyWh;
      sums.all[slot]! += energyWh;
    }
  }
  const normalise = (values: number[]) => {
    const total = values.reduce((sum, value) => sum + value, 0);
    return total > 0 ? values.map((value) => value / total) : null;
  };
  const flat = new Array<number>(96).fill(1 / 96);
  const all = normalise(sums.all) ?? flat;
  return {
    workday: normalise(sums.workday) ?? all,
    saturday: normalise(sums.saturday) ?? all,
    sunday: normalise(sums.sunday) ?? all,
  };
}

/** Whole Wh of a day spread over its quarter hours by weight (largest remainder: sums exactly). */
export function spreadDay(date: LocalDate, wh: Wh, shape: readonly number[]): Quarter[] {
  const start = startOfLisbonDay(date);
  const count = lisbonDayLength(date) / QUARTER_HOUR;
  const weights = Array.from({ length: count }, (_, index) => shape[Math.min(95, index)] ?? 0);
  const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  const exact = weights.map((weight) => (wh * weight) / total);
  const quarters = exact.map((value, index) => ({
    ts: start + index * QUARTER_HOUR,
    energyWh: Math.floor(value),
  }));
  let left = wh - quarters.reduce((sum, quarter) => sum + quarter.energyWh, 0);
  const order = exact
    .map((value, index) => [value - Math.floor(value), index] as const)
    .sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, index] of order) {
    if (left <= 0) break;
    quarters[index]!.energyWh++;
    left--;
  }
  return quarters;
}

export interface ForecastDay {
  date: LocalDate;
  wh: Wh;
  /** Measured (true) or forecast (false). */
  known: boolean;
  /** The temperature used (forecast days) or measured; null without one. */
  tenths: TenthsCelsius | null;
}

export interface BillForecast {
  month: string;
  asOf: LocalDate;
  /** 'naive' when there were too few days for the model. */
  method: 'model' | 'naive';
  usesTemperature: boolean;
  daysInMonth: number;
  knownDays: number;
  knownWh: Wh;
  forecastWh: Wh;
  totalWh: Wh;
  byPeriod: EnergyByPeriod;
  /** The whole month, with the tariff; null without one. */
  costCents: Cents | null;
  /** The measured days only (their energy and their share of the fixed terms). */
  spentCents: Cents | null;
  days: ForecastDay[];
}

/** Adds the quarters of one Lisbon day (starting at `start`) to the totals by period. */
function addEnergy(
  totals: EnergyByPeriod,
  periods: readonly BillingPeriod[],
  start: EpochSeconds,
  quarters: readonly Quarter[],
) {
  for (const { ts, energyWh } of quarters) {
    const period = periods[Math.floor((ts - start) / QUARTER_HOUR)] ?? 'simple';
    totals[period] = (totals[period] ?? 0) + energyWh;
  }
}

/**
 * The forecast of `month` made at the start of `asOf`: the complete days
 * before asOf are measured, the others are forecast. Null when neither the
 * model nor the naive baseline has enough days.
 */
export function forecastMonth(
  data: ForecastData,
  month: string,
  asOf: LocalDate,
  temperatureOf: TemperatureOf,
  method: 'model' | 'naive' = 'model',
): BillForecast | null {
  let usedMethod = method;
  let model = method === 'model' ? fitDailyModel(data, asOf, temperatureOf) : null;
  if (!model) {
    usedMethod = 'naive';
    model = naiveModel(data, asOf);
  }
  if (!model) return null;
  const shapes = dayShapes(data, asOf);

  const known: EnergyByPeriod = {};
  const all: EnergyByPeriod = {};
  const days: ForecastDay[] = [];
  let knownDays = 0;
  let knownWh = 0;
  let forecastWh = 0;
  for (const date of monthDates(month)) {
    const day = data.days.get(date);
    const tenths = temperatureOf(date);
    if (date < asOf && day?.complete) {
      addEnergy(known, data.periodsOf(date), day.start, day.quarters);
      addEnergy(all, data.periodsOf(date), day.start, day.quarters);
      knownDays++;
      knownWh += day.wh;
      days.push({ date, wh: day.wh, known: true, tenths });
    } else {
      const wh = Math.round(model.predict(date, tenths));
      const quarters = spreadDay(date, wh, shapes[dayKind(date)]);
      addEnergy(all, data.periodsOf(date), quarters[0]?.ts ?? 0, quarters);
      forecastWh += wh;
      days.push({ date, wh, known: false, tenths });
    }
  }
  const tariff = data.tariff;
  return {
    month,
    asOf,
    method: usedMethod,
    usesTemperature: model.usesTemperature,
    daysInMonth: days.length,
    knownDays,
    knownWh,
    forecastWh,
    totalWh: knownWh + forecastWh,
    byPeriod: all,
    costCents: tariff ? electricityCost(all, days.length, tariff).totalCents : null,
    spentCents: tariff ? electricityCost(known, knownDays, tariff).totalCents : null,
    days,
  };
}

// ---- Backtest and the likely range ----

/** Days of the month on which past forecasts are made (the days before are measured). */
export const BACKTEST_DAYS = [5, 10, 15, 20, 25];

export interface BacktestSample {
  month: string;
  /** Day of the month of the forecast. */
  day: number;
  /** Cents with a tariff, otherwise Wh. */
  actual: number;
  model: number;
  naive: number;
}

export interface Backtest {
  unit: 'cents' | 'wh';
  samples: BacktestSample[];
  /** Mean absolute error, % of the actual; null without samples. */
  modelErrorPct: number | null;
  naiveErrorPct: number | null;
}

const total = (forecast: BillForecast, unit: Backtest['unit']) =>
  unit === 'cents' ? (forecast.costCents ?? 0) : forecast.totalWh;

/**
 * Forecasts made on each complete month before `beforeMonth` at BACKTEST_DAYS,
 * against what the month really was. The days after the forecast use the usual
 * temperature (`normalOf`), as a real forecast would for most of the month;
 * the days before use the measured one.
 */
export function backtest(
  data: ForecastData,
  beforeMonth: string,
  measuredOf: TemperatureOf,
  normalOf: TemperatureOf,
): Backtest {
  const unit = data.tariff ? 'cents' : 'wh';
  const months = new Set<string>();
  for (const day of data.days.values()) months.add(day.date.slice(0, 7));
  const samples: BacktestSample[] = [];
  for (const month of [...months].sort()) {
    if (month >= beforeMonth) continue;
    const dates = monthDates(month);
    if (!dates.every((date) => data.days.get(date)?.complete)) continue;
    // Every day measured: what the month really was.
    const byPeriod: EnergyByPeriod = {};
    let wh = 0;
    for (const date of dates) {
      const day = data.days.get(date)!;
      addEnergy(byPeriod, data.periodsOf(date), day.start, day.quarters);
      wh += day.wh;
    }
    const actual = data.tariff
      ? electricityCost(byPeriod, dates.length, data.tariff).totalCents
      : wh;
    if (actual <= 0) continue;
    for (const day of BACKTEST_DAYS) {
      const asOf = dates[day - 1]!;
      const temperatureOf: TemperatureOf = (date) =>
        date < asOf ? measuredOf(date) : normalOf(date);
      const model = forecastMonth(data, month, asOf, temperatureOf, 'model');
      const naive = forecastMonth(data, month, asOf, temperatureOf, 'naive');
      // Only where the model itself ran: early months fall back to the baseline.
      if (!model || !naive || model.method !== 'model') continue;
      samples.push({ month, day, actual, model: total(model, unit), naive: total(naive, unit) });
    }
  }
  const meanError = (pick: (sample: BacktestSample) => number) =>
    samples.length === 0
      ? null
      : (samples.reduce(
          (sum, sample) => sum + Math.abs(pick(sample) - sample.actual) / sample.actual,
          0,
        ) /
          samples.length) *
        100;
  return {
    unit,
    samples,
    modelErrorPct: meanError((sample) => sample.model),
    naiveErrorPct: meanError((sample) => sample.naive),
  };
}

/** Fewer past forecasts than this near the same day: no range is shown. */
export const MIN_RANGE_SAMPLES = 4;

/**
 * The likely range of a forecast total, from how wrong the backtest was on
 * forecasts made near the same day of the month: the 10th to 90th percentile
 * of its relative errors. Null with too few samples.
 */
export function forecastRange(
  value: number,
  dayOfMonth: number,
  samples: readonly BacktestSample[],
): { low: number; high: number } | null {
  const nearest = BACKTEST_DAYS.reduce((best, day) =>
    Math.abs(day - dayOfMonth) < Math.abs(best - dayOfMonth) ? day : best,
  );
  // Forecast / actual − 1, for the samples made nearest to this day.
  const ratios = samples
    .filter((sample) => sample.day === nearest && sample.actual > 0)
    .map((sample) => sample.model / sample.actual - 1)
    .sort((a, b) => a - b);
  if (ratios.length < MIN_RANGE_SAMPLES) return null;
  const at = (q: number) => {
    const position = q * (ratios.length - 1);
    const lower = Math.floor(position);
    const upper = Math.min(lower + 1, ratios.length - 1);
    return ratios[lower]! + (ratios[upper]! - ratios[lower]!) * (position - lower);
  };
  // An over-forecast (ratio > 0) means the real value is lower.
  return {
    low: Math.round(value / (1 + at(0.9))),
    high: Math.round(value / (1 + at(0.1))),
  };
}
