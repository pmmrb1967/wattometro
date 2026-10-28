// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { TariffInput } from '../domain/tariff';
import { startOfLisbonDay } from '../lib/time';
import { groupCostCents } from './day';

// Tri-hourly without fixed terms or taxes: only the energy and VAT count.
const tri: TariffInput = {
  validFrom: '2026-01-01',
  supplier: null,
  powerVa: 10_350,
  option: 'tri',
  cycle: 'daily',
  periodsMap: 'pre-2027',
  fixedPerDay: 0,
  energy: { peak: 250_000, full: 180_000, empty: 100_000 },
  iecPerKwh: 0,
  cavPerMonth: 0,
  dgegPerMonth: 0,
  largeFamily: false,
  energyDiscountBp: 0,
  socialEnergyPerKwh: 0,
  socialPowerPerDay: 0,
  socialFinancingPerKwh: 0,
};

// 26/10/2026, winter time: Lisbon is UTC.
const DAY = startOfLisbonDay('2026-10-26');
const at = (hour: number, minute = 0) => DAY + hour * 3600 + minute * 60;

describe('groupCostCents', () => {
  it('prices a group of cycles at the hour of each, as a named appliance', () => {
    const analysis = {
      quarters: [
        { ts: at(3), energyWh: 5_000 },
        { ts: at(19), energyWh: 5_000 },
      ],
    };
    // 1 kWh in the peak period (19:00 in winter): 0,25 € × 1,23 = 30,75 cents, rounded per day
    // (215,25 − 184,5 → 215 − 185 = 30), as in appliance-cost.test.ts.
    const peak = { energyWh: 1_000, cycles: [{ start: at(19), end: at(19, 10) }] };
    expect(groupCostCents(peak, analysis, tri)).toBe(30);
    // The same kWh in two uses, one in empty (03:00) and one in peak: half each.
    const both = {
      energyWh: 1_000,
      cycles: [
        { start: at(3), end: at(3, 10) },
        { start: at(19), end: at(19, 10) },
      ],
    };
    expect(groupCostCents(both, analysis, tri)).toBe(21);
  });
});
