// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Rows read and written per UTC day, the free plan's limits (D1 counts them per
 * UTC day): every request and Cron run adds what it did (worker.ts).
 */
import type { Sql } from '../db';

const PREFIX = 'rows_read:';
const WRITTEN_PREFIX = 'rows_written:';

/** 'YYYY-MM-DD' of an epoch second, in UTC (D1's day, not Lisbon's). */
export function utcDay(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

/** Adds a request's or a Cron run's rows read and written to the day's counts. */
export async function addUsage(
  sql: Sql,
  day: string,
  rowsRead: number,
  rowsWritten: number,
): Promise<void> {
  const counts: [string, number][] = [
    [PREFIX + day, rowsRead],
    [WRITTEN_PREFIX + day, rowsWritten],
  ];
  const kept = counts.filter(([, rows]) => rows > 0);
  if (kept.length === 0) return;
  await sql.run(
    `INSERT INTO maintenance_state (name, value) VALUES ${kept.map(() => '(?, ?)').join(', ')}
     ON CONFLICT (name) DO UPDATE SET value = value + excluded.value`,
    ...kept.flat(),
  );
}

/** Rows read only (tests and callers that write nothing). */
export async function addRowsRead(sql: Sql, day: string, rows: number): Promise<void> {
  await addUsage(sql, day, rows, 0);
}

export async function rowsReadOn(sql: Sql, day: string): Promise<number> {
  const row = await sql.first<{ value: number }>(
    'SELECT value FROM maintenance_state WHERE name = ?',
    PREFIX + day,
  );
  return row?.value ?? 0;
}

export interface DayUsage {
  /** UTC day. */
  day: string;
  rowsRead: number;
  rowsWritten: number;
}

/** The days from `fromDay` (UTC) with their counts, oldest first (two primary-key ranges). */
export async function usageSince(sql: Sql, fromDay: string): Promise<DayUsage[]> {
  const rows = await sql.all<{ name: string; value: number }>(
    `SELECT name, value FROM maintenance_state
     WHERE (name >= ? AND name < ?) OR (name >= ? AND name < ?)`,
    PREFIX + fromDay,
    PREFIX + '~',
    WRITTEN_PREFIX + fromDay,
    WRITTEN_PREFIX + '~',
  );
  const days = new Map<string, DayUsage>();
  for (const { name, value } of rows) {
    const written = name.startsWith(WRITTEN_PREFIX);
    const day = name.slice((written ? WRITTEN_PREFIX : PREFIX).length);
    const usage = days.get(day) ?? { day, rowsRead: 0, rowsWritten: 0 };
    if (written) usage.rowsWritten = value;
    else usage.rowsRead = value;
    days.set(day, usage);
  }
  return [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
}

/** Forgets the days before `day`. */
export async function purgeRowsRead(sql: Sql, day: string): Promise<void> {
  await sql.batch([
    {
      query: 'DELETE FROM maintenance_state WHERE name >= ? AND name < ?',
      params: [PREFIX, PREFIX + day],
    },
    {
      query: 'DELETE FROM maintenance_state WHERE name >= ? AND name < ?',
      params: [WRITTEN_PREFIX, WRITTEN_PREFIX + day],
    },
  ]);
}
