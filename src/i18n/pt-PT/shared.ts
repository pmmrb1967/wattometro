// SPDX-License-Identifier: AGPL-3.0-or-later
/** Small helpers more than one page's texts use. */
/** The voltage band of a complaint letter, already formatted ("207 V"). */
export interface Band {
  low: string;
  high: string;
  floor: string;
}

export const minutes = (count: number) => `${count} ${count === 1 ? 'minuto' : 'minutos'}`;
/** Monday first, as weekdayOf (src/domain/consumption.ts). */
export const WEEKDAYS_PLURAL = [
  'segundas-feiras',
  'terças-feiras',
  'quartas-feiras',
  'quintas-feiras',
  'sextas-feiras',
  'sábados',
  'domingos',
];
