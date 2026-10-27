// SPDX-License-Identifier: AGPL-3.0-or-later
/** omie_days (migration 0019): the market prices of the last days and tomorrow. */
import { z } from 'zod';
import type { OmieDay } from '../../../src/domain/omie';
import type { Sql } from '../db';

export interface StoredOmieDay extends OmieDay {
  start: number;
}

const pricesSchema = z.array(z.number().int());

export async function saveOmieDay(
  sql: Sql,
  day: OmieDay,
  start: number,
  now: number,
): Promise<void> {
  await sql.run(
    `INSERT INTO omie_days (day, start, step, prices, fetched_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (day) DO UPDATE SET start = excluded.start, step = excluded.step,
       prices = excluded.prices, fetched_at = excluded.fetched_at`,
    day.date,
    start,
    day.step,
    JSON.stringify(day.prices),
    now,
  );
}

/** The stored days from `from` (YYYY-MM-DD) on, oldest first. */
export async function omieDaysFrom(sql: Sql, from: string): Promise<StoredOmieDay[]> {
  const rows = await sql.all<{ day: string; start: number; step: number; prices: string }>(
    'SELECT day, start, step, prices FROM omie_days WHERE day >= ? ORDER BY day',
    from,
  );
  return rows.map((row) => ({
    date: row.day,
    start: row.start,
    step: row.step,
    prices: pricesSchema.parse(JSON.parse(row.prices)),
  }));
}

export async function hasOmieDay(sql: Sql, day: string): Promise<boolean> {
  return (await sql.first('SELECT 1 AS found FROM omie_days WHERE day = ?', day)) !== null;
}

/** Days before `before` are not needed any more (the history is in public/data/omie-pt.json). */
export async function forgetOmieDaysBefore(sql: Sql, before: string): Promise<void> {
  await sql.run('DELETE FROM omie_days WHERE day < ?', before);
}
