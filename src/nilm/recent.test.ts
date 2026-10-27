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

const total = (label: string, cycles: number, energyWh: number, costCents: number | null) =>
  ({ appliance: appliance(label), cycles, energyWh, spans: [], costCents }) as NamedTotal;

const day = (date: string, totals: NamedTotal[], minutes = 1440): RecentDay => ({
  day: date,
  minutes,
  dayMinutes: 1440,
  totals,
});

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
      },
      // 26 cents in 2 days, too; less energy, so second.
      { label: 'Fogão', uses: 3, energyWh: 1200, costCents: 26, perMonthCents: 395, days: 2 },
    ]);
  });

  it('leaves out days the Shelly missed much of, and costs without a tariff', () => {
    const recent = recentAppliances([
      day('2026-10-21', [total('Fogão', 2, 800, null)]),
      day('2026-10-20', [total('Fogão', 5, 2000, 40)], 1000),
    ]);
    expect(recent.days).toEqual(['2026-10-21']);
    expect(recent.appliances).toEqual([
      { label: 'Fogão', uses: 2, energyWh: 800, costCents: null, perMonthCents: null, days: 1 },
    ]);
  });
});
