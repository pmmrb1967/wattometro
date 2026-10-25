// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { addDays } from '../domain/consumption';
import { daySlots } from '../app/compare-series';
import { lisbonParts, type LocalDate } from '../lib/time';
import { findAnomalies, MIN_REFERENCE_DAYS } from './anomalies';
import { prepareForecast } from './bill-forecast';

const START: LocalDate = '2026-01-05'; // a Monday
const DAYS = 20 * 7;

/** Deterministic noise in [−1, 1) (a linear congruential generator). */
function noise(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return (state / 2_147_483_648) * 2 - 1;
  };
}

/**
 * A house drawing ~150 W, plus 1 kW in the evening on working days and at
 * midday at weekends, ±10 % per day and ±20 % per quarter; `plant` changes a day.
 */
function house(plant: (date: LocalDate, hour: number, wh: number) => number = (_, __, wh) => wh) {
  const random = noise(7);
  const quarters = [];
  for (let d = 0; d < DAYS; d++) {
    const date = addDays(START, d);
    const weekend = lisbonParts(daySlots(date)[0] as number).weekday % 6 === 0;
    const dayFactor = 1 + 0.1 * random();
    for (const ts of daySlots(date)) {
      const hour = lisbonParts(ts).hour;
      const busy = weekend ? hour >= 11 && hour < 15 : hour >= 18 && hour < 22;
      const watts = (150 + (busy ? 1000 : 0)) * dayFactor * (1 + 0.2 * random());
      quarters.push({ ts, energyWh: Math.round(plant(date, hour, watts / 4)) });
    }
  }
  return quarters;
}

const EVENING = '2026-04-14'; // a Tuesday
const AWAY = '2026-04-22'; // a Wednesday

describe('findAnomalies', () => {
  it('finds a planted evening and a day away, and little else', () => {
    const quarters = house((date, hour, wh) => {
      if (date === EVENING && hour >= 19 && hour < 22) return wh + 1500 / 4;
      if (date === AWAY) return wh * 0.4;
      return wh;
    });
    const found = findAnomalies(prepareForecast(quarters, null), addDays(START, 28));
    const evening = found.find((anomaly) => anomaly.date === EVENING);
    expect(evening).toMatchObject({ direction: 1, kind: 'workday', span: { from: 19, to: 22 } });
    expect(evening?.span?.excessWh).toBeGreaterThan(4000);
    expect(evening?.excessCents).toBeNull();
    expect(found.find((anomaly) => anomaly.date === AWAY)).toMatchObject({ direction: -1 });
    // Of ~110 ordinary days judged, at most 2 false alarms.
    const others = found.filter((anomaly) => anomaly.date !== EVENING && anomaly.date !== AWAY);
    expect(others.length).toBeLessThanOrEqual(2);
  });

  it('flags nothing in a house that only has its everyday noise', () => {
    const found = findAnomalies(prepareForecast(house(), null), addDays(START, 28));
    expect(found.length).toBeLessThanOrEqual(2);
  });

  it('needs enough days of the same kind before judging one', () => {
    const quarters = house().filter(({ ts }) => ts < daySlots(addDays(START, 14))[0]!);
    // Two weeks: at most 9 earlier working days, fewer Saturdays and Sundays.
    const found = findAnomalies(prepareForecast(quarters, null), START);
    expect(found.every((anomaly) => anomaly.references >= MIN_REFERENCE_DAYS)).toBe(true);
    expect(found.filter((anomaly) => anomaly.kind !== 'workday')).toEqual([]);
  });

  it('compares with days of a similar temperature when the weather matters', () => {
    // Electric heating: cold days use 6 kWh more; the planted day is cold, like a third of them.
    const cold = (date: LocalDate) => Number(date.slice(8)) % 3 === 0;
    const quarters = house((date, _hour, wh) => (cold(date) ? wh + 250 / 4 : wh));
    const temperatureOf = (date: LocalDate) => (cold(date) ? 20 : 150);
    const data = prepareForecast(quarters, null);
    const matched = findAnomalies(data, addDays(START, 28), temperatureOf);
    const ignored = findAnomalies(data, addDays(START, 28));
    // Without the temperature, cold days look unusual; with it, they do not.
    const coldOnes = (found: typeof matched) => found.filter((anomaly) => cold(anomaly.date));
    expect(coldOnes(ignored).length).toBeGreaterThan(5);
    expect(coldOnes(matched).length).toBeLessThanOrEqual(2);
    expect(matched.every((anomaly) => anomaly.temperatureMatched)).toBe(true);
  });
});
