// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  consumptionEstimate,
  estimateSchema,
  estimateWh,
  coldAverage,
  labelAverageW,
  recentMeasured,
  type EstimatedEquipment,
} from './equipment-estimate';
import { lisbonDate, nextDate, startOfLisbonDay, type LocalDate } from '../lib/time';
import type { TariffInput } from './tariff';

describe('estimateWh', () => {
  it('works out each basis by hand', () => {
    // A fridge of 250 kWh/ano over 30 days: 250 000 × 30 / 365 = 20 547,9 → 20 548 Wh.
    expect(estimateWh({ basis: 'year', labelWh: 250_000 }, null, 30)).toBe(20_548);
    // A washer of 58 kWh/100 ciclos, 4 per week, 30 days: 58 000 × 4 × 30 / 700 = 9942,9 → 9943.
    expect(estimateWh({ basis: 'cycles100', labelWh: 58_000, cyclesPerWeek: 4 }, null, 30)).toBe(
      9943,
    );
    // A TV of 70 kWh/1000 h, 3 h 30 a day, 30 days: 70 000 × 210 × 30 / 60 000 = 7350.
    expect(estimateWh({ basis: 'hours1000', labelWh: 70_000, minutesPerDay: 210 }, null, 30)).toBe(
      7350,
    );
    // A kettle of 2200 W, 10 minutes a day, 30 days: 2200 × 10 × 30 / 60 = 11 000.
    expect(estimateWh({ basis: 'plate', minutesPerDay: 10 }, 2200, 30)).toBe(11_000);
  });

  it('gives nothing by the plate without a plate', () => {
    expect(estimateWh({ basis: 'plate', minutesPerDay: 10 }, null, 30)).toBeNull();
  });

  it('gives the average power of a yearly label', () => {
    // 250 000 Wh / 8760 h = 28,5 → 29 W.
    expect(labelAverageW({ basis: 'year', labelWh: 250_000 })).toBe(29);
    expect(labelAverageW({ basis: 'plate', minutesPerDay: 10 })).toBeNull();
  });

  it('takes only whole, bounded values', () => {
    expect(estimateSchema.safeParse({ basis: 'cycles100', labelWh: 58_000 }).success).toBe(false);
    expect(
      estimateSchema.safeParse({ basis: 'hours1000', labelWh: 70_000, minutesPerDay: 1500 })
        .success,
    ).toBe(false);
    expect(estimateSchema.safeParse({ basis: 'year', labelWh: 250.5 }).success).toBe(false);
  });
});

describe('consumptionEstimate', () => {
  const items: EstimatedEquipment[] = [
    {
      id: 'f',
      name: 'Frigorífico',
      kind: 'fridge',
      ratedPowerW: null,
      estimate: { basis: 'year', labelWh: 250_000 },
    },
    {
      id: 'w',
      name: 'Máquina da roupa',
      kind: 'washer',
      ratedPowerW: 2100,
      estimate: { basis: 'cycles100', labelWh: 58_000, cyclesPerWeek: 4 },
    },
    {
      id: 'k',
      name: 'Chaleira',
      kind: 'kettle',
      ratedPowerW: 2200,
      estimate: { basis: 'plate', minutesPerDay: 10 },
    },
    {
      id: 'o',
      name: 'Forno',
      kind: 'oven',
      ratedPowerW: null,
      estimate: { basis: 'plate', minutesPerDay: 20 },
    },
    { id: 't', name: 'Tostadeira', kind: null, ratedPowerW: 800, estimate: null },
  ];

  it('sets each estimate against what the E-Redes measured, the largest first', () => {
    // 300 kWh measured in 30 days; 9 000 cents of energy (power term apart).
    const result = consumptionEstimate(items, {
      measuredWh: 300_000,
      days: 30,
      from: '2026-10-01',
      to: '2026-10-30',
      energyCents: 9000,
    });
    expect(result.rows).toEqual(
      [
        { id: 'k', name: 'Chaleira', wh: 11_000, cents: 330, pct: 4 },
        { id: 'f', name: 'Frigorífico', wh: 20_548, cents: 616, pct: 7 },
        { id: 'w', name: 'Máquina da roupa', wh: 9943, cents: 298, pct: 3 },
      ].sort((a, b) => b.wh - a.wh),
    );
    // 41 491 of 300 000 Wh = 13,8 %; the rest 258 509 Wh.
    expect(result).toMatchObject({ explainedWh: 41_491, explainedPct: 14, restWh: 258_509 });
    // The oven has no plate; the toaster no estimate.
    expect(result.missing).toEqual(['Forno', 'Tostadeira']);
  });

  it('says when the estimates pass what was measured', () => {
    const result = consumptionEstimate(items, {
      measuredWh: 30_000,
      days: 30,
      from: '2026-10-01',
      to: '2026-10-30',
      energyCents: 900,
    });
    expect(result.restWh).toBe(-11_491);
    expect(result.explainedPct).toBe(138);
  });
});

describe('recentMeasured', () => {
  const tariff: TariffInput = {
    validFrom: '2026-01-01',
    supplier: null,
    // Above 6,9 kVA: 23 % VAT on everything.
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
  const day = (date: LocalDate) => {
    const quarters = [];
    for (let ts = startOfLisbonDay(date); ts < startOfLisbonDay(nextDate(date)); ts += 900) {
      quarters.push({ ts, energyWh: 100 });
    }
    return quarters;
  };
  // 40 days at 100 Wh a quarter hour: 9,6 kWh a day.
  const quarters = Array.from({ length: 40 }, (_, index) =>
    day(lisbonDate(startOfLisbonDay('2026-09-01') + index * 86_400 + 43_200)),
  ).flat();

  it('takes the last 30 days measured and the cost of their energy, not the power term', () => {
    // 30 × 9,6 = 288 kWh; 288 × 0,20 € × 1,23 = 70,85 €.
    expect(recentMeasured(quarters, tariff)).toEqual({
      measuredWh: 288_000,
      days: 30,
      from: '2026-09-11',
      to: '2026-10-10',
      energyCents: 7085,
    });
  });

  it('gives no cost without a tariff, and nothing without data', () => {
    expect(recentMeasured(quarters, null)).toMatchObject({
      measuredWh: 288_000,
      energyCents: null,
    });
    expect(recentMeasured([], tariff)).toBeNull();
  });
});

describe('recentMeasured across the October change of hour', () => {
  it('counts the 25-hour day with its 100 quarters', () => {
    const quarters = [];
    for (let ts = startOfLisbonDay('2026-10-01'); ts < startOfLisbonDay('2026-11-03'); ts += 900) {
      quarters.push({ ts, energyWh: 100 });
    }
    // 4 Oct to 2 Nov: 29 days of 96 quarters and 25 Oct with 100: 2884 × 100 Wh.
    expect(recentMeasured(quarters, null)).toEqual({
      measuredWh: 288_400,
      days: 30,
      from: '2026-10-04',
      to: '2026-11-02',
      energyCents: null,
    });
  });
});

describe('coldAverage', () => {
  it('sums only fridges and freezers with a yearly label, by name', () => {
    const item = (name: string, kind: EstimatedEquipment['kind'], labelWh: number) => ({
      id: name,
      name,
      kind,
      ratedPowerW: null,
      estimate: { basis: 'year' as const, labelWh },
    });
    // 250 kWh/ano → 29 W; 175 kWh/ano → 20 W. An old washer's kWh/ano is not on at night.
    expect(
      coldAverage([
        item('Frigorífico', 'fridge', 250_000),
        item('Arca', 'freezer', 175_000),
        item('Máquina antiga', 'washer', 200_000),
      ]),
    ).toEqual({ watts: 49, names: ['Arca', 'Frigorífico'] });
    expect(coldAverage([item('Máquina antiga', 'washer', 200_000)])).toBeNull();
  });
});
