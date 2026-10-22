// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Cron jobs (server/wrangler.toml, every 5 minutes), always incremental:
 * - minutes → quarter hours → Lisbon days, and minutes → 10-minute voltage. Each run recomputes from a little
 *   before where the last one stopped (LATE_SECONDS), so minutes the Shelly
 *   sends late (its queue holds 4 h) still count. A first run, or one after a
 *   long stop, catches up at most MAX_SPAN_SECONDS at a time;
 * - once a day, deletes minutes and per-second values past their retention;
 * - records the database size, so the app can warn before the 500 MB limit.
 */
import {
  HOUR,
  floorTo,
  lisbonDate,
  nextDate,
  QUARTER_HOUR,
  startOfLisbonDay,
} from '../../src/lib/time';
import type { Sql } from './db';
import { listHouseholdIds } from './repo/households';
import {
  firstMinute,
  getState,
  purgeReadings,
  rollUpDay,
  rollUpQuarterHours,
  rollUpVoltage10m,
  setState,
} from './repo/rollups';

export const LATE_SECONDS = 6 * HOUR;
export const MAX_SPAN_SECONDS = 7 * 24 * HOUR;
export const PURGE_EVERY_SECONDS = 24 * HOUR;
export const DEFAULT_RETENTION_1M_DAYS = 730;
export const DEFAULT_RETENTION_1S_DAYS = 90;
const DAY = 24 * HOUR;
const TEN_MINUTES = 600;
const ceilTo = (ts: number, size: number) => floorTo(ts + size - 1, size);

export const STATE = {
  rolledUpUntil: (householdId: string) => `rollup_until:${householdId}`,
  purgedAt: 'purge_at',
  databaseBytes: 'db_size_bytes',
} as const;

export interface MaintenanceConfig {
  retention1mDays?: number;
  retention1sDays?: number;
}

/** Rolls one household up as far as `now`, or MAX_SPAN_SECONDS further when catching up. */
async function rollUpHousehold(sql: Sql, householdId: string, now: number): Promise<void> {
  const until = await getState(sql, STATE.rolledUpUntil(householdId));
  const start = until === null ? await firstMinute(sql, householdId) : until - LATE_SECONDS;
  if (start === null) return;

  const from = floorTo(start, QUARTER_HOUR);
  // The quarter hour in progress is included, so today's figures stay fresh.
  const to = Math.min(floorTo(now, QUARTER_HOUR) + QUARTER_HOUR, from + MAX_SPAN_SECONDS);
  await rollUpQuarterHours(sql, householdId, from, to);
  // 10-minute intervals that touch [from, to): whole intervals, recomputed from all their minutes.
  await rollUpVoltage10m(sql, householdId, floorTo(from, TEN_MINUTES), ceilTo(to, TEN_MINUTES));
  for (let day = lisbonDate(from); startOfLisbonDay(day) < to; day = nextDate(day)) {
    await rollUpDay(sql, householdId, day, startOfLisbonDay(day), startOfLisbonDay(nextDate(day)));
  }
  await setState(sql, STATE.rolledUpUntil(householdId), Math.min(to, now));
}

export async function runMaintenance(
  sql: Sql,
  now: number,
  config: MaintenanceConfig = {},
): Promise<void> {
  const households = await listHouseholdIds(sql);
  for (const householdId of households) await rollUpHousehold(sql, householdId, now);

  const purgedAt = await getState(sql, STATE.purgedAt);
  if (purgedAt === null || now - purgedAt >= PURGE_EVERY_SECONDS) {
    const minutesBefore = now - (config.retention1mDays ?? DEFAULT_RETENTION_1M_DAYS) * DAY;
    const secondsBefore = now - (config.retention1sDays ?? DEFAULT_RETENTION_1S_DAYS) * DAY;
    for (const householdId of households) {
      await purgeReadings(sql, householdId, minutesBefore, secondsBefore);
    }
    await setState(sql, STATE.purgedAt, now);
  }

  const size = sql.sizeBytes ? await sql.sizeBytes() : null;
  if (size !== null) await setState(sql, STATE.databaseBytes, size);
}
