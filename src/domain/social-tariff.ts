// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * "Tenho direito à tarifa social?" for electricity: the official criteria
 * against what the user answers (never stored nor sent), and what it would
 * take off a year of this house's real consumption.
 *
 * Adapted from the Faturómetro (src/domain/social-tariff.ts, electricity only;
 * github.com/pmmrb1967/faturometro). Reference data, updated yearly (CLAUDE.md
 * rule 6), sources and dates in docs/social-tariff.md:
 * - ERSE leaflet "Tarifa social" (October 2026): the benefits, the income limit
 *   (6 272,64 € a year, +50 % per member without income, up to 10), up to
 *   6,9 kVA, an average discount of 33,8 % (without taxes) and no IEC.
 */
import type { Cents } from '../lib/money';
import { electricityCost, type Cost, type EnergyByPeriod } from './electricity-cost';
import type { TariffInput } from './tariff';

export const SOCIAL_TARIFF_SOURCES = {
  erse: 'https://www.erse.pt/media/xvtbbuq4/tarifa-social_eletricidade_gas_out2026_pt.pdf',
  dgeg: 'https://www.dgeg.gov.pt/pt/areas-transversais/politicas-de-protecao-ao-consumidor-de-energia/tarifa-social-de-energia/',
} as const;

/** The social benefits that give the right to it in electricity (ERSE, a) to f)). */
export const BENEFITS = [
  'csi',
  'rsi',
  'unemployment',
  'family_allowance',
  'invalidity',
  'old_age',
] as const;
export type Benefit = (typeof BENEFITS)[number];

/** Yearly household income limit before the increase per member without income. */
export const INCOME_LIMIT_CENTS: Cents = 627_264;
/** The limit grows 50 % per member without income, the applicant included, up to 10. */
const MAX_MEMBERS = 10;
/** Contracted power up to 6,9 kVA. */
export const MAX_POWER_VA = 6900;
/** Average discount, without taxes and VAT: 33,8 %, in tenths of a percent. */
export const AVERAGE_DISCOUNT_PER_MILLE = 338;

export interface SocialTariffAnswers {
  benefits: readonly Benefit[];
  /** Household's yearly income; undefined when the user did not say. */
  annualIncomeCents?: Cents;
  /** Members of the household without any income, the applicant included. */
  membersWithoutIncome: number;
}

export interface SocialTariffCheck {
  eligible: boolean;
  reason?: 'benefit' | 'income';
  incomeLimitCents: Cents;
}

export function incomeLimit(membersWithoutIncome: number): Cents {
  const members = Math.min(Math.max(Math.trunc(membersWithoutIncome), 0), MAX_MEMBERS);
  return Math.round(INCOME_LIMIT_CENTS * (1 + members / 2));
}

export function checkSocialTariff(answers: SocialTariffAnswers): SocialTariffCheck {
  const incomeLimitCents = incomeLimit(answers.membersWithoutIncome);
  if (answers.benefits.length > 0) return { eligible: true, reason: 'benefit', incomeLimitCents };
  if (answers.annualIncomeCents !== undefined && answers.annualIncomeCents <= incomeLimitCents) {
    return { eligible: true, reason: 'income', incomeLimitCents };
  }
  return { eligible: false, incomeLimitCents };
}

/** The tariff already has the social discount (copied from the invoice in Settings). */
export function hasSocialTariff(
  tariff: Pick<TariffInput, 'socialEnergyPerKwh' | 'socialPowerPerDay'>,
) {
  return tariff.socialEnergyPerKwh > 0 || tariff.socialPowerPerDay > 0;
}

/**
 * About what it would take off this year: the average discount on energy and
 * power (their VAT goes down with them), plus the IEC with its VAT. An
 * estimate: the real discount is on the network access, set by ERSE each year.
 */
export function socialTariffSaving(
  cost: Pick<Cost, 'energyCents' | 'powerCents' | 'taxesCents'>,
  energy: EnergyByPeriod,
  days: number,
  tariff: TariffInput,
): { discountCents: Cents; iecCents: Cents; totalCents: Cents } {
  const discountCents = Math.round(
    ((cost.energyCents + cost.powerCents) * AVERAGE_DISCOUNT_PER_MILLE) / 1000,
  );
  const withoutIec = electricityCost(energy, days, { ...tariff, iecPerKwh: 0 });
  const iecCents = cost.taxesCents - withoutIec.taxesCents;
  return { discountCents, iecCents, totalCents: discountCents + iecCents };
}
