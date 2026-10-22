// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The household's electricity contract, as copied from an invoice: prices
 * WITHOUT VAT in integer micro-euros (src/lib/money.ts), power in VA. Shared by
 * the app (form, cost engine) and the server (validation of POST /v1/tariffs),
 * so it must not import browser-only modules.
 */
import { z } from 'zod';

export const TARIFF_OPTIONS = ['simple', 'bi', 'tri'] as const;
export type TariffOption = (typeof TARIFF_OPTIONS)[number];
export const CYCLES = ['daily', 'weekly'] as const;
export type Cycle = (typeof CYCLES)[number];
/** ERSE maps of time-of-use periods (docs/time-cycles.md). */
export const PERIODS_MAPS = ['pre-2027', '2027'] as const;
export type PeriodsMap = (typeof PERIODS_MAPS)[number];

/** Hours in a map (vazio, cheias, ponta). */
export type MeterPeriod = 'empty' | 'full' | 'peak';
/** What an energy price applies to. */
export type BillingPeriod = 'simple' | 'offEmpty' | MeterPeriod;

/** Prices each option needs, in display order. */
export const OPTION_PERIODS: Record<TariffOption, readonly BillingPeriod[]> = {
  simple: ['simple'],
  bi: ['offEmpty', 'empty'],
  tri: ['peak', 'full', 'empty'],
};

/** Up to 10 €/kWh or €/day: anything above is a typing mistake. */
export const MAX_PRICE_MICRO = 10_000_000;
export const MAX_SUPPLIER = 60;

const price = z.number().int().min(0).max(MAX_PRICE_MICRO);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const tariffInputSchema = z
  .object({
    /** First Lisbon day the contract applies to. */
    validFrom: z.string().regex(DATE),
    supplier: z.string().trim().max(MAX_SUPPLIER).nullable(),
    /** Contracted power, VA (src/data/power-tiers.json). */
    powerVa: z.number().int().min(1150).max(41400),
    option: z.enum(TARIFF_OPTIONS),
    cycle: z.enum(CYCLES),
    periodsMap: z.enum(PERIODS_MAPS),
    /** Fixed (power) term, µ€/day. */
    fixedPerDay: price,
    /** Energy, µ€/kWh, by billing period (only those of the option). */
    energy: z.object({
      simple: price.optional(),
      offEmpty: price.optional(),
      empty: price.optional(),
      full: price.optional(),
      peak: price.optional(),
    }),
    /** Imposto especial de consumo, µ€/kWh. */
    iecPerKwh: price,
    /** Contribuição audiovisual and DGEG fee, µ€/month. */
    cavPerMonth: price,
    dgegPerMonth: price,
    /** Família numerosa: 300 kWh per 30 days at reduced VAT (docs/electricity-vat.md). */
    largeFamily: z.boolean(),
  })
  .superRefine((tariff, context) => {
    for (const period of OPTION_PERIODS[tariff.option]) {
      if (tariff.energy[period] === undefined) {
        context.addIssue({ code: 'custom', path: ['energy', period], message: 'Missing price' });
      }
    }
  })
  .transform((tariff) => ({
    ...tariff,
    // Only the prices of the chosen option are kept.
    energy: Object.fromEntries(
      OPTION_PERIODS[tariff.option].map((period) => [period, tariff.energy[period]]),
    ) as Partial<Record<BillingPeriod, number>>,
  }));
export type TariffInput = z.infer<typeof tariffInputSchema>;

export interface Tariff extends TariffInput {
  id: string;
}

/** The contract in force on a Lisbon day: the latest that started on or before it. */
export function tariffOn<T extends { validFrom: string }>(
  tariffs: readonly T[],
  date: string,
): T | null {
  let found: T | null = null;
  for (const tariff of tariffs) {
    if (tariff.validFrom <= date && (!found || tariff.validFrom > found.validFrom)) found = tariff;
  }
  return found;
}
