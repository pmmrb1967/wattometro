// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { formatCents } from '../../lib/money';
import type { RecentAppliances } from '../../nilm/recent';
import { APPLIANCE_TOOLS } from './appliance-tools';
import { runTool, type ToolContext } from './tool';

const context = (recent: RecentAppliances | null): ToolContext => ({
  today: '2026-10-27',
  quarters: [],
  yearFrom: 0,
  tariffs: null,
  daily: null,
  offers: async () => null,
  power: async () => null,
  quality: async () => null,
  appliances: async () => recent,
});

describe('get_appliances', () => {
  it('gives the card’s appliances, formatted as the app shows them', async () => {
    const outcome = await runTool(
      APPLIANCE_TOOLS,
      'get_appliances',
      {},
      context({
        days: ['2026-10-20', '2026-10-26'],
        appliances: [
          {
            label: 'Máquina da loiça',
            uses: 3,
            energyWh: 3720,
            costCents: 78,
            perMonthCents: 339,
            days: 3,
            shiftable: true,
            savingCents: 30,
            perMonthSavingCents: 130,
            periods: null,
          },
        ],
      }),
    );
    expect(outcome).toEqual({
      ok: true,
      result: {
        days: 2,
        from: '2026-10-20',
        to: '2026-10-26',
        appliances: [
          {
            name: 'Máquina da loiça',
            uses: 3,
            daysOn: 3,
            energy: '3,72\u00a0kWh',
            cost: formatCents(78),
            perMonth: formatCents(339),
            lessPerMonthInCheapestPeriod: formatCents(130),
          },
        ],
      },
    });
  });

  it('says so without a Shelly or names', async () => {
    const outcome = await runTool(APPLIANCE_TOOLS, 'get_appliances', {}, context(null));
    expect(outcome).toMatchObject({ ok: true, result: { note: expect.any(String) } });
  });
});
