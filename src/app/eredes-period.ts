// SPDX-License-Identifier: AGPL-3.0-or-later
/** Settings → E-Redes consumption: which dates to ask the Balcão Digital for. */
import { t } from '../i18n/pt-PT';
import { formatLocalDate, lisbonDate, lisbonToday, type LocalDate } from '../lib/time';

const texts = t.eredes.period;

/**
 * A year the first time (the most E-Redes gives, docs/eredes-csv.md); then
 * from the first day not imported to yesterday, or nothing once up to date.
 * `to` is the end of the last quarter hour stored: midnight after a whole day.
 */
export function askFor(to: number | null, today: LocalDate = lisbonToday()): string {
  if (to === null) return texts.first;
  const from = lisbonDate(to);
  return from >= today ? texts.upToDate : texts.next(formatLocalDate(from));
}
