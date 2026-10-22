// SPDX-License-Identifier: AGPL-3.0-or-later
// Adapted from Faturómetro (src/domain/erse.ts): electricity only.
/**
 * Normalized ERSE electricity offers (public/data/erse-offers.json), produced
 * by scripts/erse-sync.ts. Format of the source: docs/erse-data.md.
 * Prices are €/day and €/kWh WITHOUT VAT, as decimal numbers exactly as the
 * ERSE publishes them; they become integer micro-euros only when used
 * (src/lib/money.ts).
 */
import { z } from 'zod';

/** Billing cycles as the ERSE codes them: 1 simple, 2 bi-hourly, 3 tri-hourly. */
export const cycleCodeSchema = z.enum(['1', '2', '3']);
export type CycleCode = z.infer<typeof cycleCodeSchema>;

export const cyclePricesSchema = z.object({
  /** Fixed term, €/day. */
  fixedPerDay: z.number(),
  /** Simple: one price. */
  simple: z.number().optional(),
  /** Bi-hourly. */
  offEmpty: z.number().optional(),
  empty: z.number().optional(),
  /** Tri-hourly ("empty" shared with bi-hourly). */
  peak: z.number().optional(),
  full: z.number().optional(),
});
export type CyclePrices = z.infer<typeof cyclePricesSchema>;

export const offerSchema = z.object({
  id: z.string(),
  supplier: z.string(),
  name: z.string(),
  segment: z.enum(['Dom', 'Tod']),
  /** DUAL: electricity and gas sold together (only the electricity part is kept). */
  supply: z.enum(['ELE', 'DUAL']),
  durationMonths: z.number().nullable(),
  validFrom: z.string().nullable(),
  validTo: z.string().nullable(),
  loyalty: z.boolean(),
  indexedPrices: z.boolean(),
  renewable: z.boolean(),
  restrictions: z.boolean(),
  requiredServices: z.boolean(),
  /** Mandatory extra services, €/year with VAT. */
  servicesPerYearWithVat: z.number(),
  /** Discounts for every client. */
  discounts: z.object({
    fixedPerYear: z.number(),
    fixedTermPct: z.number(),
    energyPct: z.number(),
    energyPerKwh: z.number(),
  }),
  /** Discounts only for new clients (shown, not applied). */
  newClientDiscounts: z.object({
    fixedPerYearWithVat: z.number(),
    fixedTermPct: z.number(),
    energyPct: z.number(),
    energyPerKwh: z.number(),
  }),
  payment: z.object({ directDebit: z.boolean(), multibanco: z.boolean(), cash: z.boolean() }),
  billing: z.object({ electronic: z.boolean(), paper: z.boolean() }),
  links: z.object({
    offer: z.string().optional(),
    standardSheet: z.string().optional(),
    generalTerms: z.string().optional(),
  }),
  texts: z.object({
    loyalty: z.string().optional(),
    restrictions: z.string().optional(),
    priceUpdates: z.string().optional(),
  }),
  /** By contracted power (kVA, as "6.9") and cycle code. */
  prices: z.record(z.string(), z.partialRecord(cycleCodeSchema, cyclePricesSchema)),
});
export type Offer = z.infer<typeof offerSchema>;

/** Format of erse-offers.json; part of its URL so a cached older file is never used. */
export const OFFERS_SCHEMA_VERSION = 1;
export const OFFERS_URL = `/data/erse-offers.json?v=${OFFERS_SCHEMA_VERSION}`;

export const offersFileSchema = z.object({
  schemaVersion: z.literal(OFFERS_SCHEMA_VERSION),
  source: z.string(),
  /** ERSE update date (from the file name), ISO. */
  dataDate: z.string(),
  fetchedAt: z.string(),
  offers: z.array(offerSchema),
});
export type OffersFile = z.infer<typeof offersFileSchema>;

/** 6900 VA → "6.9" (key of Offer.prices). */
export function powerKey(powerVa: number): string {
  return String(powerVa / 1000);
}
