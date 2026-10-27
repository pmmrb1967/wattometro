// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Joins the OMIE day-ahead price files for Portugal into public/data/omie-pt.json.
 * Format: docs/omie.md.
 */
import { QUARTER_HOUR, startOfMadridDay, type EpochSeconds } from '../../src/lib/time';
import {
  OMIE_SCHEMA_VERSION,
  omieFileSchema,
  type OmieDay,
  type OmieFile,
} from '../../src/domain/omie';

export { parseOmieDay, type OmieDay } from '../../src/domain/omie';

/**
 * The days as one series of quarter hours from the first day's start (hourly
 * prices repeat in their four quarters); a missing day is a run of nulls.
 */
export function joinDays(
  days: readonly OmieDay[],
  meta: { source: string; fetchedAt: string },
): OmieFile {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0];
  if (!first) throw new Error('No OMIE days');
  const start: EpochSeconds = startOfMadridDay(first.date);
  const prices: (number | null)[] = [];
  for (const day of sorted) {
    const from = (startOfMadridDay(day.date) - start) / QUARTER_HOUR;
    while (prices.length < from) prices.push(null);
    if (prices.length > from) throw new Error(`${day.date} overlaps the day before`);
    const repeat = day.step / QUARTER_HOUR;
    for (const price of day.prices) for (let i = 0; i < repeat; i++) prices.push(price);
  }
  return omieFileSchema.parse({
    schemaVersion: OMIE_SCHEMA_VERSION,
    ...meta,
    start,
    prices,
  });
}
