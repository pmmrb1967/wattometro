// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { startOfLisbonDay } from '../lib/time';
import { applianceCostCents, spreadOverQuarters } from './appliance-cost';
import type { TariffInput } from './tariff';

const simple: TariffInput = {
  validFrom: '2026-01-01',
  supplier: null,
  powerVa: 6900,
  option: 'simple',
  cycle: 'daily',
  periodsMap: 'pre-2027',
  fixedPerDay: 343_600,
  energy: { simple: 166_500 }, // 0,1665 €/kWh
  iecPerKwh: 1_000,
  cavPerMonth: 2_850_000,
  dgegPerMonth: 70_000,
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

// 26/10/2026, winter time: Lisbon is UTC.
const DAY = startOfLisbonDay('2026-10-26');
const at = (hour: number, minute = 0) => DAY + hour * 3600 + minute * 60;

describe('spreadOverQuarters', () => {
  it('splits by the seconds in each quarter hour, adding up exactly', () => {
    // 10:10 to 10:25: 300 s in the 10:00 quarter, 600 s in the 10:15 one.
    expect(spreadOverQuarters(100, [{ start: at(10, 10), end: at(10, 25) }])).toEqual([
      { ts: at(10), energyWh: 33 },
      { ts: at(10, 15), energyWh: 67 },
    ]);
  });

  it('counts overlapping uses once, and nothing without seconds', () => {
    const spans = [
      { start: at(10), end: at(10, 10) },
      { start: at(10, 5), end: at(10, 15) },
    ];
    expect(spreadOverQuarters(50, spans)).toEqual([{ ts: at(10), energyWh: 50 }]);
    expect(spreadOverQuarters(50, [])).toEqual([]);
  });
});

describe('applianceCostCents', () => {
  it('prices the last kWh of the day: at the normal VAT rate, with IEC', () => {
    // 10 kWh in the day, 1 kWh of it the appliance's; 6,667 kWh at 6 % VAT either way,
    // so the appliance's kWh pays 23 %: (0,1665 + 0,001) × 1,23 = 0,2060 €.
    const day = [{ ts: at(12), energyWh: 10_000 }];
    const own = [{ ts: at(12), energyWh: 1_000 }];
    expect(applianceCostCents(own, day, simple)).toBe(21);
  });

  it('prices each use at its hour (tri-hourly, daily cycle)', () => {
    const day = [
      { ts: at(3), energyWh: 5_000 },
      { ts: at(19), energyWh: 5_000 },
    ];
    // Empty at 03:00, peak at 19:00 in winter: 1 kWh × 0,10 or 0,25 € × 1,23 = 12,3 or
    // 30,75 cents. Each day is rounded to the cent: 215,25 − 184,5 → 215 − 185 = 30.
    expect(applianceCostCents([{ ts: at(3), energyWh: 1_000 }], day, tri)).toBe(12);
    expect(applianceCostCents([{ ts: at(19), energyWh: 1_000 }], day, tri)).toBe(30);
  });

  it('never prices more than the day had', () => {
    const day = [{ ts: at(3), energyWh: 500 }];
    expect(applianceCostCents([{ ts: at(3), energyWh: 1_000 }], day, tri)).toBe(6);
  });
});
