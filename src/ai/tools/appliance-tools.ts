// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * get_appliances ("Consumo › Aparelhos", "Quanto custam os aparelhos"): the appliances
 * the house named, over the last whole days with per-second values, with what
 * each cost and a month like these days, as the card shows them.
 */
import { z } from 'zod';
import { formatCents } from '../../lib/money';
import { formatKwh } from '../../lib/units';
import { defineTool } from './tool';

const appliances = defineTool({
  name: 'get_appliances',
  description:
    'As on "Consumo › Aparelhos" ("Quanto custam os aparelhos"): the appliances the user named (recognised from the Shelly’s per-second values), over the last whole days: uses, energy, what they cost with the tariff (energy, IEC and VAT, at the hour of each use) and a month like those days. For whole programmes (washing machine, dishwasher), what a month would cost less with them always in the cheapest period of the tariff (zero with a simple tariff: then "Tarifários" says whether bi-hourly pays off). Only named appliances; the rest of the house is not in it.',
  input: z.strictObject({}),
  async run(_input, context) {
    const recent = await context.appliances();
    if (!recent) {
      return { note: 'No per-second values (no Shelly) or no named appliances yet.' };
    }
    return {
      days: recent.days.length,
      from: recent.days[0] ?? null,
      to: recent.days.at(-1) ?? null,
      appliances: recent.appliances.map((item) => ({
        name: item.label,
        uses: item.uses,
        daysOn: item.days,
        energy: formatKwh(item.energyWh, 2),
        cost: item.costCents === null ? 'unknown (no tariff)' : formatCents(item.costCents),
        perMonth: item.perMonthCents === null ? null : formatCents(item.perMonthCents),
        ...(item.shiftable && {
          lessPerMonthInCheapestPeriod:
            item.perMonthSavingCents === null ? null : formatCents(item.perMonthSavingCents),
        }),
      })),
    };
  },
});

export const APPLIANCE_TOOLS = [appliances];
