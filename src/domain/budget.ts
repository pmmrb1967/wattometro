// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The month's budget (Consumo › Previsão): the user gives euros; the browser
 * turns them into energy with the tariff and the month's split by period, so
 * the Cron (server/src/alerts.ts) only compares kWh and the money stays here.
 */
import { z } from 'zod';
import type { Cents } from '../lib/money';
import type { Wh } from '../lib/units';
import { electricityCost, type EnergyByPeriod } from './electricity-cost';
import type { TariffInput } from './tariff';

export const budgetSchema = z.object({
  /** The month's bill the user wants to stay under, with VAT. */
  cents: z.number().int().min(100).max(10_000_000),
  /** The energy a day that bill buys (budgetEnergyWh ÷ the month's days). */
  whPerDay: z.number().int().min(1).max(10_000_000),
});
export type Budget = z.infer<typeof budgetSchema>;

/** `byPeriod` scaled to `totalWh` (each period rounded). */
function scaled(byPeriod: EnergyByPeriod, sum: Wh, totalWh: Wh): EnergyByPeriod {
  const result: EnergyByPeriod = {};
  for (const [period, wh] of Object.entries(byPeriod) as [keyof EnergyByPeriod, Wh][]) {
    result[period] = Math.round((wh * totalWh) / sum);
  }
  return result;
}

/**
 * The most energy whose bill over `days` stays within `budgetCents`, spread
 * over the periods as `byPeriod` is. The bill grows with the energy (the fixed
 * terms, then the energy and its taxes), so a bisection. Null when the fixed
 * terms alone pass the budget, or without energy to take the split from.
 */
export function budgetEnergyWh(
  byPeriod: EnergyByPeriod,
  days: number,
  tariff: TariffInput,
  budgetCents: Cents,
): Wh | null {
  const sum = Object.values(byPeriod).reduce((total, wh) => total + (wh ?? 0), 0);
  if (sum <= 0) return null;
  const cost = (totalWh: Wh) =>
    electricityCost(scaled(byPeriod, sum, totalWh), days, tariff).totalCents;
  if (cost(0) > budgetCents) return null;
  let low = 0;
  let high = Math.max(sum, 1000);
  while (cost(high) <= budgetCents && high < 1e9) high *= 2;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (cost(middle) <= budgetCents) low = middle;
    else high = middle;
  }
  return low;
}
