// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { Appliance } from './appliances';
import type { NamedTotal } from './day';
import { recentAppliances, type RecentDay } from './recent';

const appliance = (label: string): Appliance => ({
  id: label,
  label,
  powerW: 2000,
  statesW: [2000],
  pulsing: false,
  minDurationS: null,
  maxDurationS: null,
  heats: null,
});

const total = (
  label: string,
  cycles: number,
  energyWh: number,
  costCents: number | null,
  extra: Partial<NamedTotal> = {},
): NamedTotal => ({
  appliance: appliance(label),
  cycles,
  energyWh,
  spans: [],
  quarters: [],
  costCents,
  savingCents: costCents === null ? null : 0,
  ...extra,
});

const day = (date: string, totals: NamedTotal[], minutes = 1440): RecentDay => ({
  day: date,
  minutes,
  dayMinutes: 1440,
  totals,
  periodsMap: 'pre-2027',
});

const notShifted = { shiftable: false, savingCents: null, perMonthSavingCents: null };
const nothing = { empty: 0, full: 0, peak: 0 };
const none = { daily: nothing, weekly: nothing };

describe('recentAppliances', () => {
  it('adds up by name, the most expensive first, with a month like these days', () => {
    const recent = recentAppliances([
      day('2026-10-21', [total('Fogão', 2, 800, 17), total('Máquina da loiça', 1, 1240, 26)]),
      day('2026-10-20', [total('fogão ', 1, 400, 9)]),
    ]);
    expect(recent.days).toEqual(['2026-10-20', '2026-10-21']);
    expect(recent.appliances).toEqual([
      // 26 cents in 2 days: 26 × 365 / 12 / 2 = 395,4 → 395.
      {
        label: 'Máquina da loiça',
        uses: 1,
        energyWh: 1240,
        costCents: 26,
        perMonthCents: 395,
        days: 1,
        ...notShifted,
        periods: none,
      },
      // 26 cents in 2 days, too; less energy, so second.
      {
        label: 'Fogão',
        uses: 3,
        energyWh: 1200,
        costCents: 26,
        perMonthCents: 395,
        days: 2,
        ...notShifted,
        periods: none,
      },
    ]);
  });

  it('leaves out days the Shelly missed much of, and costs without a tariff', () => {
    const recent = recentAppliances([
      day('2026-10-21', [total('Fogão', 2, 800, null)]),
      day('2026-10-20', [total('Fogão', 5, 2000, 40)], 1000),
    ]);
    expect(recent.days).toEqual(['2026-10-21']);
    expect(recent.appliances).toEqual([
      {
        label: 'Fogão',
        uses: 2,
        energyWh: 800,
        costCents: null,
        perMonthCents: null,
        days: 1,
        ...notShifted,
        periods: none,
      },
    ]);
  });

  it('gives a whole programme its saving, and its energy by meter period', () => {
    // 26/10/2026, a Monday in winter (Lisbon = UTC), docs/time-cycles.md: 20:00 is peak in
    // both cycles; 23:00 is empty in the daily cycle and full in the weekly one.
    const at = (hour: number) => Date.UTC(2026, 9, 26, hour) / 1000;
    const dishwasher = {
      appliance: { ...appliance('Máquina da loiça'), heats: 4 },
      quarters: [
        { ts: at(20), energyWh: 1000 },
        { ts: at(23), energyWh: 200 },
      ],
      savingCents: 12,
    };
    const recent = recentAppliances([
      day('2026-10-26', [total('Máquina da loiça', 1, 1200, 30, dishwasher)]),
    ]);
    expect(recent.appliances[0]).toMatchObject({
      shiftable: true,
      savingCents: 12,
      // 12 cents in a day: × 365 / 12 = 365.
      perMonthSavingCents: 365,
      periods: {
        daily: { empty: 200, full: 0, peak: 1000 },
        weekly: { empty: 0, full: 200, peak: 1000 },
      },
    });
  });
});
