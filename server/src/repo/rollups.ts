// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * SQL of the Cron jobs: the work happens in D1 (INSERT … SELECT), not in the
 * Worker's CPU. Every query filters by household first, so it uses the
 * (household_id, ts) indexes instead of scanning whole tables.
 */
import type { Sql } from '../db';

/** A row that did not change is not written again (D1 counts written rows). */
const UNLESS_UNCHANGED = `WHERE minutes IS NOT excluded.minutes OR energy_wh IS NOT excluded.energy_wh
  OR power_max_w IS NOT excluded.power_max_w OR voltage_min_dv IS NOT excluded.voltage_min_dv
  OR voltage_max_dv IS NOT excluded.voltage_max_dv
  OR apparent_max_va IS NOT excluded.apparent_max_va
  OR apparent_minutes IS NOT excluded.apparent_minutes
  OR active_only_max_w IS NOT excluded.active_only_max_w`;

const UPDATE_ALL = `minutes = excluded.minutes, energy_wh = excluded.energy_wh,
  power_max_w = excluded.power_max_w, voltage_min_dv = excluded.voltage_min_dv,
  voltage_max_dv = excluded.voltage_max_dv, apparent_max_va = excluded.apparent_max_va,
  apparent_minutes = excluded.apparent_minutes, active_only_max_w = excluded.active_only_max_w`;

/** Recomputes the Shelly quarter hours that start in [from, to) from the minutes. */
export async function rollUpQuarterHours(
  sql: Sql,
  householdId: string,
  from: number,
  to: number,
): Promise<void> {
  await sql.run(
    `INSERT INTO readings_15m (household_id, meter, ts, source, minutes, energy_wh, power_max_w,
       voltage_min_dv, voltage_max_dv, apparent_max_va, apparent_minutes, active_only_max_w)
     SELECT household_id, device_id || ':' || channel, ts - ts % 900, 'shelly', COUNT(*),
       SUM(energy_wh), MAX(power_max_w), MIN(voltage_min_dv), MAX(voltage_max_dv),
       MAX(apparent_max_va), COUNT(apparent_max_va),
       MAX(CASE WHEN apparent_max_va IS NULL THEN power_max_w END)
     FROM readings_1m
     WHERE household_id = ? AND ts >= ? AND ts < ?
     GROUP BY device_id, channel, ts - ts % 900
     ON CONFLICT (household_id, meter, ts) DO UPDATE SET ${UPDATE_ALL} ${UNLESS_UNCHANGED}`,
    householdId,
    from,
    to,
  );
}

/**
 * Recomputes the 10-minute voltage values that start in [from, to) (multiples of
 * 600) from the minutes: the mean of the minutes' averages and their extremes.
 */
export async function rollUpVoltage10m(
  sql: Sql,
  householdId: string,
  from: number,
  to: number,
): Promise<void> {
  await sql.run(
    `INSERT INTO voltage_10m (household_id, meter, ts, minutes, voltage_avg_dv, voltage_min_dv,
       voltage_max_dv)
     SELECT household_id, device_id || ':' || channel, ts - ts % 600, COUNT(*),
       CAST(ROUND(AVG(voltage_avg_dv)) AS INTEGER), MIN(voltage_min_dv), MAX(voltage_max_dv)
     FROM readings_1m
     WHERE household_id = ? AND ts >= ? AND ts < ?
     GROUP BY device_id, channel, ts - ts % 600
     ON CONFLICT (household_id, meter, ts) DO UPDATE SET minutes = excluded.minutes,
       voltage_avg_dv = excluded.voltage_avg_dv, voltage_min_dv = excluded.voltage_min_dv,
       voltage_max_dv = excluded.voltage_max_dv
     WHERE minutes IS NOT excluded.minutes OR voltage_avg_dv IS NOT excluded.voltage_avg_dv
       OR voltage_min_dv IS NOT excluded.voltage_min_dv OR voltage_max_dv IS NOT excluded.voltage_max_dv`,
    householdId,
    from,
    to,
  );
}

/**
 * Recomputes one Lisbon day ([start, end) in epoch seconds) from its quarter
 * hours, for the meters with minutes in [from, to) (the ones just rolled up).
 * Naming the meters keeps the search on the primary key; without them it reads
 * every quarter of the household, E-Redes included.
 */
export async function rollUpDay(
  sql: Sql,
  householdId: string,
  day: string,
  start: number,
  end: number,
  from: number,
  to: number,
): Promise<void> {
  await sql.run(
    `INSERT INTO daily (household_id, meter, day, source, minutes, energy_wh, power_max_w,
       voltage_min_dv, voltage_max_dv, apparent_max_va, apparent_minutes, active_only_max_w)
     SELECT household_id, meter, ?, source, SUM(minutes), SUM(energy_wh), MAX(power_max_w),
       MIN(voltage_min_dv), MAX(voltage_max_dv), MAX(apparent_max_va), SUM(apparent_minutes),
       MAX(active_only_max_w)
     FROM readings_15m
     WHERE household_id = ? AND source = 'shelly' AND ts >= ? AND ts < ?
       AND meter IN (SELECT DISTINCT device_id || ':' || channel FROM readings_1m
         WHERE household_id = ? AND ts >= ? AND ts < ?)
     GROUP BY meter
     ON CONFLICT (household_id, meter, day) DO UPDATE SET ${UPDATE_ALL} ${UNLESS_UNCHANGED}`,
    day,
    householdId,
    start,
    end,
    householdId,
    from,
    to,
  );
}

/** Deletes minutes and per-second values older than their retention. */
export async function purgeReadings(
  sql: Sql,
  householdId: string,
  minutesBefore: number,
  secondsBefore: number,
): Promise<void> {
  await sql.batch([
    {
      query: 'DELETE FROM readings_1m WHERE household_id = ? AND ts < ?',
      params: [householdId, minutesBefore],
    },
    {
      query: 'DELETE FROM readings_1s WHERE household_id = ? AND ts < ?',
      params: [householdId, secondsBefore],
    },
  ]);
}

/** The earliest minute stored for a household, or null without any. */
export async function firstMinute(sql: Sql, householdId: string): Promise<number | null> {
  const row = await sql.first<{ ts: number | null }>(
    'SELECT MIN(ts) AS ts FROM readings_1m WHERE household_id = ?',
    householdId,
  );
  return row?.ts ?? null;
}

export async function getState(sql: Sql, name: string): Promise<number | null> {
  const row = await sql.first<{ value: number }>(
    'SELECT value FROM maintenance_state WHERE name = ?',
    name,
  );
  return row?.value ?? null;
}

export async function setState(sql: Sql, name: string, value: number): Promise<void> {
  await sql.run(
    `INSERT INTO maintenance_state (name, value) VALUES (?, ?)
     ON CONFLICT (name) DO UPDATE SET value = excluded.value`,
    name,
    value,
  );
}
