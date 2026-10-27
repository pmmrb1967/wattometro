// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Tomorrow's market prices (docs/omie.md): the Cron reads the OMIE file of the
 * next day once it is published (~13:00 CET, 12:00 in Lisbon) and keeps it in
 * omie_days. Only public market data goes either way: the request carries
 * nothing about the household.
 */
import { nextDate, startOfMadridDay, lisbonDate, lisbonParts } from '../../src/lib/time';
import { parseOmieDay } from '../../src/domain/omie';
import type { Sql } from './db';
import { forgetOmieDaysBefore, hasOmieDay, saveOmieDay } from './repo/omie';

/** Lisbon hour from which tomorrow's file is looked for. */
export const PUBLISHED_HOUR = 12;
/** Days kept, besides today and tomorrow. */
const KEEP_DAYS = 7;

export type TextFetcher = (url: string) => Promise<{ ok: boolean; text(): Promise<string> }>;

const fileUrl = (day: string) =>
  `https://www.omie.es/es/file-download?parents=marginalpdbcpt&filename=marginalpdbcpt_${day.replaceAll('-', '')}.1`;

function daysBefore(day: string, count: number): string {
  return new Date(Date.parse(`${day}T12:00:00Z`) - count * 86_400_000).toISOString().slice(0, 10);
}

/** Reads one day; false when it is not published yet or not a price file. */
async function fetchDay(sql: Sql, day: string, now: number, fetcher: TextFetcher) {
  try {
    const response = await fetcher(fileUrl(day));
    if (!response.ok) return false;
    const parsed = parseOmieDay(await response.text());
    if (parsed.date !== day) return false;
    await saveOmieDay(sql, parsed, startOfMadridDay(day), now);
    return true;
  } catch {
    return false; // Tried again in half an hour.
  }
}

/**
 * One Cron run: twice an hour at most (the runs at :00 and :30), today's file
 * if missing and, from PUBLISHED_HOUR on, tomorrow's.
 */
export async function syncOmie(
  sql: Sql,
  now: number,
  fetcher: TextFetcher = (url) =>
    fetch(url, { headers: { 'User-Agent': 'wattometro' }, redirect: 'follow' }),
): Promise<void> {
  const { hour, minute } = lisbonParts(now);
  if (minute % 30 >= 5) return;
  const today = lisbonDate(now);
  if (!(await hasOmieDay(sql, today))) await fetchDay(sql, today, now, fetcher);
  const tomorrow = nextDate(today);
  if (hour >= PUBLISHED_HOUR && !(await hasOmieDay(sql, tomorrow))) {
    if (await fetchDay(sql, tomorrow, now, fetcher)) {
      await forgetOmieDaysBefore(sql, daysBefore(today, KEEP_DAYS));
    }
  }
}
