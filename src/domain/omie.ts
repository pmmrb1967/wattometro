// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Day-ahead prices of the Portuguese zone of the Iberian market (OMIE), one per
 * quarter hour, from public/data/omie-pt.json (pnpm omie:sync, docs/omie.md).
 */
import { z } from 'zod';
import { QUARTER_HOUR, type EpochSeconds } from '../lib/time';

/** Format of omie-pt.json; part of its URL so a cached older file is never used. */
export const OMIE_SCHEMA_VERSION = 1;
export const OMIE_URL = `/data/omie-pt.json?v=${OMIE_SCHEMA_VERSION}`;

export const omieFileSchema = z.object({
  schemaVersion: z.literal(OMIE_SCHEMA_VERSION),
  /** The last file read, e.g. "marginalpdbcpt_20261026.1". */
  source: z.string(),
  fetchedAt: z.string(),
  /** Start of the first quarter hour (UTC epoch seconds). */
  start: z.number().int(),
  /** Cents per MWh for each quarter hour from `start`; null where there is no file. */
  prices: z.array(z.number().int().nullable()),
});
export type OmieFile = z.infer<typeof omieFileSchema>;

/** The price of the quarter hour starting at `ts`, in cents per MWh, or null. */
export function omiePrice(omie: OmieFile, ts: EpochSeconds): number | null {
  const index = (ts - omie.start) / QUARTER_HOUR;
  if (!Number.isInteger(index) || index < 0) return null;
  return omie.prices[index] ?? null;
}
