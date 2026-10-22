// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Time is stored in UTC as epoch seconds and shown in Europe/Lisbon. All
 * calendar logic lives here. Lisbon's offset is always a whole number of
 * hours, so minute and 15-minute boundaries are the same in UTC and local time.
 *
 * Not decided yet (Phase 2, with a real file): whether E-Redes timestamps mark
 * the start or the end of a 15-minute interval.
 */
export type EpochSeconds = number;
/** Calendar day in Lisbon, as 'YYYY-MM-DD'. */
export type LocalDate = string;

export const TIME_ZONE = 'Europe/Lisbon';
export const MINUTE = 60;
export const QUARTER_HOUR = 15 * MINUTE;
export const HOUR = 60 * MINUTE;

export interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
}

const PARTS_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  hourCycle: 'h23',
});

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function assertEpoch(ts: EpochSeconds): void {
  if (!Number.isInteger(ts)) throw new TypeError(`Not integer epoch seconds: ${ts}`);
}

/** Calendar fields of an instant in Lisbon. */
export function lisbonParts(ts: EpochSeconds): LocalParts {
  assertEpoch(ts);
  const fields: Record<string, number> = {};
  for (const part of PARTS_FORMAT.formatToParts(new Date(ts * 1000))) {
    if (part.type !== 'literal') fields[part.type] = Number(part.value);
  }
  const { year = 0, month = 0, day = 0, hour = 0, minute = 0 } = fields;
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return { year, month, day, hour, minute, weekday };
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0');
}

/** The Lisbon calendar day of an instant. */
export function lisbonDate(ts: EpochSeconds): LocalDate {
  const { year, month, day } = lisbonParts(ts);
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

function parseDate(date: LocalDate): [number, number, number] {
  const match = DATE_PATTERN.exec(date);
  if (!match) throw new RangeError(`Not a YYYY-MM-DD date: ${date}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Lisbon's offset from UTC at an instant, in seconds (3600 in summer, 0 in winter). */
export function lisbonOffset(ts: EpochSeconds): number {
  const { year, month, day, hour, minute } = lisbonParts(ts);
  const local = Date.UTC(year, month - 1, day, hour, minute) / 1000;
  return local - floorTo(ts, MINUTE);
}

/**
 * The instant a Lisbon day starts. Clocks change at 01:00 UTC (01:00 or 02:00
 * local), so local midnight always exists, is never repeated, and has the
 * offset of the hour before it.
 */
export function startOfLisbonDay(date: LocalDate): EpochSeconds {
  const [year, month, day] = parseDate(date);
  const utcMidnight = Date.UTC(year, month - 1, day) / 1000;
  return utcMidnight - lisbonOffset(utcMidnight - HOUR);
}

/** The following calendar day. */
export function nextDate(date: LocalDate): LocalDate {
  const [year, month, day] = parseDate(date);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return `${pad(next.getUTCFullYear(), 4)}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

/** Length of a Lisbon day in seconds: 24 h, or 23 h / 25 h when the clocks change. */
export function lisbonDayLength(date: LocalDate): number {
  return startOfLisbonDay(nextDate(date)) - startOfLisbonDay(date);
}

/** Start of the interval of `size` seconds that contains `ts` (e.g. QUARTER_HOUR). */
export function floorTo(ts: EpochSeconds, size: number): EpochSeconds {
  assertEpoch(ts);
  if (!Number.isInteger(size) || size <= 0 || HOUR % size !== 0) {
    throw new RangeError(`Interval must divide an hour: ${size}`);
  }
  return ts - (((ts % size) + size) % size);
}

/** An instant as shown to the user: 'DD/MM/YYYY HH:MM' in Lisbon. */
export function formatLisbonDateTime(ts: EpochSeconds): string {
  const { year, month, day, hour, minute } = lisbonParts(ts);
  return `${pad(day)}/${pad(month)}/${year} ${pad(hour)}:${pad(minute)}`;
}

/** Time of day as shown to the user: 'HH:MM' in Lisbon. */
export function formatLisbonTime(ts: EpochSeconds): string {
  const { hour, minute } = lisbonParts(ts);
  return `${pad(hour)}:${pad(minute)}`;
}

/** A Lisbon calendar day as shown to the user: 'DD/MM/YYYY'. */
export function formatLocalDate(date: LocalDate): string {
  const [year, month, day] = parseDate(date);
  return `${pad(day)}/${pad(month)}/${year}`;
}

/** Today in Lisbon. */
export function lisbonToday(): LocalDate {
  return lisbonDate(Math.floor(Date.now() / 1000));
}

/** A duration as shown to the user (e.g. 45 → "45 s", 200 → "3 min 20 s", 7500 → "2 h 05 min"). */
export function formatDuration(seconds: number): string {
  assertEpoch(seconds);
  if (seconds < MINUTE) return `${seconds} s`;
  if (seconds < HOUR) {
    const rest = seconds % MINUTE;
    return rest === 0
      ? `${seconds / MINUTE} min`
      : `${Math.floor(seconds / MINUTE)} min ${pad(rest)} s`;
  }
  return `${Math.floor(seconds / HOUR)} h ${pad(Math.floor((seconds % HOUR) / MINUTE))} min`;
}
