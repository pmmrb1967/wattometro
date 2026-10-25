// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Quarter hours imported from the E-Redes export (meter 'eredes', source
 * 'eredes'; docs/eredes-csv.md) and the energy of any meter per quarter hour.
 * Each import batch is two statements whatever its size: the rows travel as
 * one JSON parameter (json_each), within D1's limits on bound parameters and
 * queries per request, and the work is done by D1, not the Worker's CPU.
 */
import type { Sql } from '../db';

export const EREDES_METER = 'eredes';

/** [start of the quarter hour, Wh, 1 if estimated]. */
export type EredesRow = [ts: number, energyWh: number, estimated: 0 | 1];
/** [Lisbon day, its first second, the first second of the next day]. */
export type DayBounds = [day: string, start: number, end: number];

/**
 * Stores quarter hours (a quarter already stored with the same values is not
 * written again) and recomputes the E-Redes totals of the given days from all
 * their stored quarters. Returns the quarter hours written.
 */
export async function importEredes(
  sql: Sql,
  householdId: string,
  rows: EredesRow[],
  days: DayBounds[],
): Promise<number> {
  const [written = 0] = await sql.batch([
    {
      // "WHERE true": SQLite needs it to tell the upsert from a join (lang_upsert).
      query: `INSERT INTO readings_15m (household_id, meter, ts, source, energy_wh, estimated)
        SELECT ?, '${EREDES_METER}', json_extract(value, '$[0]'), 'eredes',
          json_extract(value, '$[1]'), json_extract(value, '$[2]')
        FROM json_each(?) WHERE true
        ON CONFLICT (household_id, meter, ts) DO UPDATE SET energy_wh = excluded.energy_wh,
          estimated = excluded.estimated
        WHERE energy_wh IS NOT excluded.energy_wh OR estimated IS NOT excluded.estimated`,
      params: [householdId, JSON.stringify(rows)],
    },
    {
      // One primary-key range per day (~96 rows read), for the energy, the quarters and the
      // estimated ones together (materialized, so the range is read once). A join here let
      // SQLite scan every E-Redes quarter of the household once per day of the batch
      // (~500 000 rows read).
      query: `WITH d AS MATERIALIZED (
          SELECT json_extract(value, '$[0]') AS day,
            (SELECT json_array(SUM(q.energy_wh), COUNT(*), SUM(q.estimated)) FROM readings_15m AS q
              WHERE q.household_id = ? AND q.meter = '${EREDES_METER}'
                AND q.ts >= json_extract(value, '$[1]') AND q.ts < json_extract(value, '$[2]'))
              AS totals
          FROM json_each(?))
        INSERT INTO daily (household_id, meter, day, source, energy_wh, quarters, estimated)
        SELECT ?, '${EREDES_METER}', day, 'eredes', totals ->> 0, totals ->> 1, totals ->> 2
        FROM d WHERE true
        ON CONFLICT (household_id, meter, day) DO UPDATE SET energy_wh = excluded.energy_wh,
          quarters = excluded.quarters, estimated = excluded.estimated
        WHERE energy_wh IS NOT excluded.energy_wh OR quarters IS NOT excluded.quarters
          OR estimated IS NOT excluded.estimated`,
      params: [householdId, JSON.stringify(days), householdId],
    },
  ]);
  return written;
}

export interface EredesSummary {
  quarters: number;
  estimated: number;
  energyWh: number;
  /** Start of the first quarter and end of the last, or null without data. */
  from: number | null;
  to: number | null;
}

/**
 * From the daily totals (~365 rows a year) and the first and last quarter
 * hours (one primary-key row each); days imported before the daily counts
 * existed (migration 0012) fall back to reading every quarter hour.
 */
export async function eredesSummary(sql: Sql, householdId: string): Promise<EredesSummary> {
  const daily = await sql.first<{
    quarters: number | null;
    estimated: number | null;
    energy_wh: number | null;
    unknown: number | null;
    first: number | null;
    last: number | null;
  }>(
    `SELECT SUM(quarters) AS quarters, SUM(estimated) AS estimated, SUM(energy_wh) AS energy_wh,
       SUM(quarters IS NULL) AS unknown,
       (SELECT MIN(ts) FROM readings_15m WHERE household_id = ? AND meter = '${EREDES_METER}')
         AS first,
       (SELECT MAX(ts) FROM readings_15m WHERE household_id = ? AND meter = '${EREDES_METER}')
         AS last
     FROM daily WHERE household_id = ? AND meter = '${EREDES_METER}'`,
    householdId,
    householdId,
    householdId,
  );
  if (daily && !daily.unknown) {
    return {
      quarters: daily.quarters ?? 0,
      estimated: daily.estimated ?? 0,
      energyWh: daily.energy_wh ?? 0,
      from: daily.first,
      to: daily.last === null ? null : daily.last + 900,
    };
  }
  const row = await sql.first<{
    quarters: number;
    estimated: number | null;
    energy_wh: number | null;
    first: number | null;
    last: number | null;
  }>(
    `SELECT COUNT(*) AS quarters, SUM(estimated) AS estimated, SUM(energy_wh) AS energy_wh,
       MIN(ts) AS first, MAX(ts) AS last
     FROM readings_15m WHERE household_id = ? AND meter = '${EREDES_METER}'`,
    householdId,
  );
  return {
    quarters: row?.quarters ?? 0,
    estimated: row?.estimated ?? 0,
    energyWh: row?.energy_wh ?? 0,
    from: row?.first ?? null,
    to: row?.last === null || row?.last === undefined ? null : row.last + 900,
  };
}

/** Removes the imported E-Redes data (quarter hours and daily totals). */
export async function deleteEredes(sql: Sql, householdId: string): Promise<void> {
  await sql.batch([
    {
      query: `DELETE FROM readings_15m WHERE household_id = ? AND meter = '${EREDES_METER}'`,
      params: [householdId],
    },
    {
      query: `DELETE FROM daily WHERE household_id = ? AND meter = '${EREDES_METER}'`,
      params: [householdId],
    },
  ]);
}

/** Bytes of a record of quarterEnergy: uint32 ts · uint32 Wh, little-endian. */
export const ENERGY_RECORD_BYTES = 8;

/** Energy of a meter ('eredes' or 'device:channel') per quarter hour in [from, to), oldest first. */
export async function quarterEnergy(
  sql: Sql,
  householdId: string,
  meter: string,
  from: number,
  to: number,
): Promise<Uint8Array> {
  const rows = await sql.all<{ ts: number; energy_wh: number }>(
    `SELECT ts, energy_wh FROM readings_15m
     WHERE household_id = ? AND meter = ? AND ts >= ? AND ts < ? ORDER BY ts`,
    householdId,
    meter,
    from,
    to,
  );
  const records = new Uint8Array(rows.length * ENERGY_RECORD_BYTES);
  const view = new DataView(records.buffer);
  rows.forEach((row, index) => {
    view.setUint32(index * ENERGY_RECORD_BYTES, row.ts, true);
    view.setUint32(index * ENERGY_RECORD_BYTES + 4, Math.max(0, row.energy_wh), true);
  });
  return records;
}

/**
 * Meters with data on the Lisbon days [fromDay, toDay]: their energy and how many
 * days. From the daily totals (one row per day), not the quarter hours.
 */
export async function energyMeters(
  sql: Sql,
  householdId: string,
  fromDay: string,
  toDay: string,
): Promise<{ meter: string; days: number; energyWh: number }[]> {
  const rows = await sql.all<{ meter: string; days: number; energy_wh: number }>(
    `SELECT meter, COUNT(*) AS days, SUM(energy_wh) AS energy_wh FROM daily
     WHERE household_id = ? AND day >= ? AND day <= ? GROUP BY meter ORDER BY meter`,
    householdId,
    fromDay,
    toDay,
  );
  return rows.map((row) => ({ meter: row.meter, days: row.days, energyWh: row.energy_wh }));
}

/**
 * Energy of a meter per Lisbon day in [fromDay, toDay], oldest first: the sum of
 * its quarter hours, so the app can check the ones it keeps (src/app/energy-cache.ts),
 * and the minutes with data (a Shelly; null for E-Redes), to tell whole days.
 */
export async function dailyEnergy(
  sql: Sql,
  householdId: string,
  meter: string,
  fromDay: string,
  toDay: string,
): Promise<[string, number, number | null][]> {
  const rows = await sql.all<{ day: string; energy_wh: number; minutes: number | null }>(
    `SELECT day, energy_wh, minutes FROM daily
     WHERE household_id = ? AND meter = ? AND day >= ? AND day <= ? ORDER BY day`,
    householdId,
    meter,
    fromDay,
    toDay,
  );
  return rows.map((row) => [row.day, row.energy_wh, row.minutes]);
}
