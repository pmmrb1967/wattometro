// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Portuguese mandatory public holidays (Código do Trabalho, art. 234.º, n.º 1,
 * as worded by Lei n.º 8/2016): docs/holidays.md. Used to tell holidays from
 * working days in the bill forecast; they do not change the tariff periods
 * (in BTN a holiday follows its weekday, docs/time-cycles.md).
 */
import type { LocalDate } from '../lib/time';

/** Holidays fixed on the calendar, "MM-DD", always observed. */
const FIXED = ['01-01', '04-25', '05-01', '06-10', '08-15', '12-08', '12-25'];
/** Suspended from 2013 (Lei n.º 23/2012) and restored on 2016-04-02 (Lei n.º 8/2016). */
const RESTORED = ['10-05', '11-01', '12-01'];
const RESTORED_FROM: LocalDate = '2016-04-02';
const SUSPENDED_FROM: LocalDate = '2013-01-01';

const pad = (value: number) => String(value).padStart(2, '0');

/** Easter Sunday of a Gregorian year (Meeus/Jones/Butcher "anonymous" algorithm). */
export function easterSunday(year: number): LocalDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${pad(month)}-${pad(day)}`;
}

function addDays(date: LocalDate, days: number): LocalDate {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** The mandatory holidays of a year, sorted. */
export function holidays(year: number): LocalDate[] {
  const easter = easterSunday(year);
  const dates = FIXED.map((monthDay) => `${year}-${monthDay}`);
  dates.push(addDays(easter, -2), easter);
  // Corpus Christi (Easter + 60) and the three restored dates share the same history.
  const restored = [addDays(easter, 60), ...RESTORED.map((monthDay) => `${year}-${monthDay}`)];
  for (const date of restored) {
    if (date < SUSPENDED_FROM || date >= RESTORED_FROM) dates.push(date);
  }
  return dates.sort();
}

const cache = new Map<number, ReadonlySet<LocalDate>>();

/** Whether a Lisbon date is a mandatory public holiday. */
export function isHoliday(date: LocalDate): boolean {
  const year = Number(date.slice(0, 4));
  let set = cache.get(year);
  if (!set) {
    set = new Set(holidays(year));
    cache.set(year, set);
  }
  return set.has(date);
}
