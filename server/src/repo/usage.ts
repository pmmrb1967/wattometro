// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Rows read per UTC day, the free plan's binding limit (D1 counts it per UTC
 * day): every request and Cron run adds what it read (worker.ts).
 */
import type { Sql } from '../db';

const PREFIX = 'rows_read:';

/** 'YYYY-MM-DD' of an epoch second, in UTC (D1's day, not Lisbon's). */
export function utcDay(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

export async function addRowsRead(sql: Sql, day: string, rows: number): Promise<void> {
  if (rows <= 0) return;
  await sql.run(
    `INSERT INTO maintenance_state (name, value) VALUES (?, ?)
     ON CONFLICT (name) DO UPDATE SET value = value + excluded.value`,
    PREFIX + day,
    rows,
  );
}

export async function rowsReadOn(sql: Sql, day: string): Promise<number> {
  const row = await sql.first<{ value: number }>(
    'SELECT value FROM maintenance_state WHERE name = ?',
    PREFIX + day,
  );
  return row?.value ?? 0;
}

/** Forgets the days before `day`. */
export async function purgeRowsRead(sql: Sql, day: string): Promise<void> {
  await sql.run('DELETE FROM maintenance_state WHERE name >= ? AND name < ?', PREFIX, PREFIX + day);
}
