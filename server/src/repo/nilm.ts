// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * nilm_days (migration 0024): each day's cycles as the browser found them,
 * compressed by the browser (src/nilm/stored.ts). The Worker only stores and
 * returns the bytes; one primary-key range per read.
 */
import type { Sql } from '../db';

export interface NilmDay {
  day: string;
  version: number;
  minutes: number;
  data: Uint8Array;
}

/** The days of a meter in [fromDay, toDay], oldest first. */
export async function nilmDays(
  sql: Sql,
  householdId: string,
  meter: string,
  fromDay: string,
  toDay: string,
): Promise<NilmDay[]> {
  const rows = await sql.all<{
    day: string;
    version: number;
    minutes: number;
    data: ArrayBuffer | Uint8Array;
  }>(
    `SELECT day, version, minutes, data FROM nilm_days
     WHERE household_id = ? AND meter = ? AND day >= ? AND day <= ? ORDER BY day`,
    householdId,
    meter,
    fromDay,
    toDay,
  );
  return rows.map((row) => ({
    day: row.day,
    version: row.version,
    minutes: row.minutes,
    data: new Uint8Array(row.data),
  }));
}

/** Saves the days, each replacing what was there (idempotent), in one transaction. */
export async function saveNilmDays(
  sql: Sql,
  householdId: string,
  meter: string,
  days: readonly NilmDay[],
  now: number,
): Promise<void> {
  await sql.batch(
    days.map((day) => ({
      query: `INSERT INTO nilm_days (household_id, meter, day, version, minutes, data, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (household_id, meter, day) DO UPDATE SET version = excluded.version,
          minutes = excluded.minutes, data = excluded.data, updated_at = excluded.updated_at`,
      params: [householdId, meter, day.day, day.version, day.minutes, day.data, now],
    })),
  );
}
