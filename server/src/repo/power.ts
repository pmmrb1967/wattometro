// SPDX-License-Identifier: AGPL-3.0-or-later
/** Contracted power (docs/contracted-power.md): peaks per meter, minute and quarter hour. */
import { READINGS_1S_BYTES } from '../../../src/lib/readings-1s';
import {
  floorTo,
  lisbonDate,
  nextDate,
  QUARTER_HOUR,
  startOfLisbonDay,
} from '../../../src/lib/time';
import type { Sql } from '../db';

const ceilTo = (ts: number, size: number) => floorTo(ts + size - 1, size);

export interface MeterPower {
  /** 'device_id:channel'. */
  meter: string;
  minutes: number;
  /** Minutes with an apparent peak (sent with per-second values). */
  apparentMinutes: number;
  apparentMaxVa: number | null;
  /** Highest one-second active power, W, of every minute. */
  activeMaxW: number | null;
  /** Highest one-second active power of the minutes without an apparent peak. */
  activeOnlyMaxW: number | null;
}

/**
 * [from, to) cut so that the Cron's aggregates stand in for the minutes
 * (migration 0021): minutes for the head before the first whole quarter hour
 * and for the tail the Cron has not rolled up yet (from `rolledUpUntil`),
 * quarter hours in between, and whole Lisbon days in the middle of those.
 * Without a roll-up yet, everything comes from the minutes.
 */
export interface RangeSplit {
  /** Minutes: [from, first whole quarter hour). */
  head: [number, number];
  /** Quarter hours: [first whole quarter, cutoff). */
  quarters: [number, number];
  /** Quarter hours before and after the whole days, inside `quarters`. */
  edges: [[number, number], [number, number]];
  /** Lisbon days [first, last) wholly inside `quarters` (empty when equal). */
  days: [string, string];
  /** Minutes: [cutoff, to). */
  tail: [number, number];
}

export function splitRange(from: number, to: number, rolledUpUntil: number | null): RangeSplit {
  const firstQuarter = Math.min(ceilTo(from, QUARTER_HOUR), to);
  const cutoff =
    rolledUpUntil === null
      ? firstQuarter
      : Math.max(
          firstQuarter,
          Math.min(floorTo(rolledUpUntil, QUARTER_HOUR), floorTo(to, QUARTER_HOUR)),
        );
  let dayFrom = startOfLisbonDay(lisbonDate(firstQuarter));
  if (dayFrom < firstQuarter) dayFrom = startOfLisbonDay(nextDate(lisbonDate(firstQuarter)));
  dayFrom = Math.min(dayFrom, cutoff);
  const dayTo = Math.max(startOfLisbonDay(lisbonDate(cutoff)), dayFrom);
  return {
    head: [from, firstQuarter],
    quarters: [firstQuarter, cutoff],
    edges: [
      [firstQuarter, dayFrom],
      [dayTo, cutoff],
    ],
    days: [lisbonDate(dayFrom), dayFrom === dayTo ? lisbonDate(dayFrom) : lisbonDate(dayTo)],
    tail: [cutoff, to],
  };
}

/**
 * Peaks per meter over the split range: ~90 days and ~200 quarter hours plus a
 * few minutes, instead of every minute.
 */
export async function powerByMeter(
  sql: Sql,
  householdId: string,
  range: RangeSplit,
): Promise<MeterPower[]> {
  const minutes = `SELECT device_id || ':' || channel AS meter, 1 AS minutes,
       apparent_max_va IS NOT NULL AS apparent_minutes, apparent_max_va, power_max_w,
       CASE WHEN apparent_max_va IS NULL THEN power_max_w END AS active_only_max_w
     FROM readings_1m WHERE household_id = ? AND ts >= ? AND ts < ?`;
  const quarters = `SELECT meter, minutes, apparent_minutes, apparent_max_va, power_max_w,
       active_only_max_w
     FROM readings_15m WHERE household_id = ? AND ts >= ? AND ts < ? AND source = 'shelly'`;
  const rows = await sql.all<{
    meter: string;
    minutes: number;
    apparent_minutes: number | null;
    apparent_max_va: number | null;
    active_max_w: number | null;
    active_only_max_w: number | null;
  }>(
    `SELECT meter, SUM(minutes) AS minutes, SUM(apparent_minutes) AS apparent_minutes,
       MAX(apparent_max_va) AS apparent_max_va, MAX(power_max_w) AS active_max_w,
       MAX(active_only_max_w) AS active_only_max_w
     FROM (
       ${minutes} UNION ALL ${minutes} UNION ALL ${quarters} UNION ALL ${quarters}
       UNION ALL
       SELECT meter, minutes, apparent_minutes, apparent_max_va, power_max_w, active_only_max_w
       FROM daily WHERE household_id = ? AND source = 'shelly' AND day >= ? AND day < ?
     )
     GROUP BY meter ORDER BY meter`,
    householdId,
    ...range.head,
    householdId,
    ...range.tail,
    householdId,
    ...range.edges[0],
    householdId,
    ...range.edges[1],
    householdId,
    ...range.days,
  );
  return rows.map((row) => ({
    meter: row.meter,
    minutes: row.minutes,
    apparentMinutes: row.apparent_minutes ?? 0,
    apparentMaxVa: row.apparent_max_va,
    activeMaxW: row.active_max_w,
    activeOnlyMaxW: row.active_only_max_w,
  }));
}

export interface QuarterPeak {
  /** Start of the quarter hour. */
  ts: number;
  /** Highest one-second power of the quarter: apparent (VA) where known, else active (W). */
  peak: number;
  /** Some minute of the quarter had no apparent peak (active power used instead). */
  estimated: boolean;
}

/** A quarter hour's peak from its aggregates: apparent where known, else active. */
const QUARTER_PEAK = 'MAX(COALESCE(apparent_max_va, -1), COALESCE(active_only_max_w, -1))';

/** The `limit` quarter hours of a meter with the highest one-second power, highest first. */
export async function topQuarters(
  sql: Sql,
  householdId: string,
  deviceId: string,
  channel: number,
  range: RangeSplit,
  limit: number,
): Promise<QuarterPeak[]> {
  const minutes = `SELECT ts - ts % 900 AS ts, MAX(COALESCE(apparent_max_va, power_max_w)) AS peak,
       MAX(apparent_max_va IS NULL) AS estimated
     FROM readings_1m
     WHERE device_id = ? AND channel = ? AND household_id = ? AND ts >= ? AND ts < ?
     GROUP BY ts - ts % 900`;
  const rows = await sql.all<{ ts: number; peak: number; estimated: number }>(
    `SELECT ts, peak, estimated FROM (
       ${minutes} UNION ALL ${minutes}
       UNION ALL
       SELECT ts, ${QUARTER_PEAK} AS peak, minutes > COALESCE(apparent_minutes, 0) AS estimated
       FROM readings_15m WHERE household_id = ? AND meter = ? AND ts >= ? AND ts < ?
     )
     ORDER BY peak DESC, ts LIMIT ?`,
    deviceId,
    channel,
    householdId,
    ...range.head,
    deviceId,
    channel,
    householdId,
    ...range.tail,
    householdId,
    `${deviceId}:${channel}`,
    ...range.quarters,
    limit,
  );
  return rows.map((row) => ({ ts: row.ts, peak: row.peak, estimated: row.estimated === 1 }));
}

/** Quarter hours from the E-Redes file: count and highest energy (Phase 2). */
export async function eredesQuarters(
  sql: Sql,
  householdId: string,
  from: number,
  to: number,
): Promise<{ quarters: number; maxEnergyWh: number | null }> {
  const row = await sql.first<{ quarters: number; max_energy_wh: number | null }>(
    `SELECT COUNT(*) AS quarters, MAX(energy_wh) AS max_energy_wh FROM readings_15m
     WHERE household_id = ? AND meter = 'eredes' AND ts >= ? AND ts < ?`,
    householdId,
    from,
    to,
  );
  return { quarters: row?.quarters ?? 0, maxEnergyWh: row?.max_energy_wh ?? null };
}

/**
 * Binary record of a minute above a threshold, for the trip simulation in the
 * browser (src/domain/contracted-power.ts), little-endian:
 *   uint32 ts · int32 power_max_w · int32 apparent_max_va (−1: none) ·
 *   uint8 1 if per-second values follow, else 0 · 361 bytes readings_1s (zeros if none)
 */
export const PEAK_RECORD_BYTES = 4 + 4 + 4 + 1 + READINGS_1S_BYTES;

/**
 * Minutes of a meter whose one-second peak (apparent, else active) is above
 * `threshold`, oldest first, packed as records. At most `limit`; `truncated` if more.
 */
export async function peakMinutes(
  sql: Sql,
  householdId: string,
  deviceId: string,
  channel: number,
  range: RangeSplit,
  threshold: number,
  limit: number,
): Promise<{ records: Uint8Array; count: number; truncated: boolean }> {
  const minutes = `SELECT ts, power_max_w, apparent_max_va FROM readings_1m
     WHERE device_id = ? AND channel = ? AND household_id = ? AND ts >= ? AND ts < ?
       AND COALESCE(apparent_max_va, power_max_w) > ?`;
  const rows = await sql.all<{
    ts: number;
    power_max_w: number;
    apparent_max_va: number | null;
    data: ArrayBuffer | Uint8Array | null;
  }>(
    // Rolled-up stretch: only the minutes of the quarter hours whose peak is above it.
    `SELECT m.ts, m.power_max_w, m.apparent_max_va, s.data
     FROM (
       ${minutes} UNION ALL ${minutes}
       UNION ALL
       SELECT m.ts, m.power_max_w, m.apparent_max_va
       FROM readings_15m AS q
       JOIN readings_1m AS m ON m.device_id = ? AND m.channel = ? AND m.ts >= q.ts
         AND m.ts < q.ts + 900
       WHERE q.household_id = ? AND q.meter = ? AND q.ts >= ? AND q.ts < ?
         AND ${QUARTER_PEAK.replaceAll('apparent_max_va', 'q.apparent_max_va').replaceAll('active_only_max_w', 'q.active_only_max_w')} > ?
         AND m.household_id = ? AND COALESCE(m.apparent_max_va, m.power_max_w) > ?
     ) AS m
     LEFT JOIN readings_1s AS s ON s.device_id = ? AND s.channel = ? AND s.ts = m.ts
     ORDER BY m.ts LIMIT ?`,
    deviceId,
    channel,
    householdId,
    ...range.head,
    threshold,
    deviceId,
    channel,
    householdId,
    ...range.tail,
    threshold,
    deviceId,
    channel,
    householdId,
    `${deviceId}:${channel}`,
    ...range.quarters,
    threshold,
    householdId,
    threshold,
    deviceId,
    channel,
    limit + 1,
  );
  const kept = rows.slice(0, limit);
  const records = new Uint8Array(kept.length * PEAK_RECORD_BYTES);
  const view = new DataView(records.buffer);
  kept.forEach((row, index) => {
    const offset = index * PEAK_RECORD_BYTES;
    view.setUint32(offset, row.ts, true);
    view.setInt32(offset + 4, row.power_max_w, true);
    view.setInt32(offset + 8, row.apparent_max_va ?? -1, true);
    const data = row.data === null ? null : new Uint8Array(row.data);
    if (data && data.byteLength === READINGS_1S_BYTES) {
      view.setUint8(offset + 12, 1);
      records.set(data, offset + 13);
    }
  });
  return { records, count: kept.length, truncated: rows.length > limit };
}

export interface DayPeak {
  /** 'device_id:channel'. */
  meter: string;
  /** Lisbon day. */
  day: string;
  /** Highest one-second power of the day: apparent (VA) where known, else active (W). */
  peak: number;
  /** Some minute of the day had no apparent peak (active power used instead). */
  estimated: boolean;
}

/**
 * The highest one-second power of each meter and Lisbon day, over the split
 * range: the Cron's days, and quarter hours for the rest (by their Lisbon day),
 * so a year costs a row per day instead of every minute.
 */
export async function dayPeaks(
  sql: Sql,
  householdId: string,
  range: RangeSplit,
): Promise<DayPeak[]> {
  const minutes = `SELECT device_id || ':' || channel AS meter, ts - ts % 900 AS ts,
       MAX(COALESCE(apparent_max_va, power_max_w)) AS peak, MAX(apparent_max_va IS NULL) AS estimated
     FROM readings_1m WHERE household_id = ? AND ts >= ? AND ts < ?
     GROUP BY device_id, channel, ts - ts % 900`;
  const quarters = `SELECT meter, ts, ${QUARTER_PEAK} AS peak,
       minutes > COALESCE(apparent_minutes, 0) AS estimated
     FROM readings_15m WHERE household_id = ? AND ts >= ? AND ts < ? AND source = 'shelly'`;
  const parts = await sql.all<{ meter: string; ts: number; peak: number; estimated: number }>(
    `${minutes} UNION ALL ${minutes} UNION ALL ${quarters} UNION ALL ${quarters}`,
    householdId,
    ...range.head,
    householdId,
    ...range.tail,
    householdId,
    ...range.edges[0],
    householdId,
    ...range.edges[1],
  );
  const days = await sql.all<{ meter: string; day: string; peak: number; estimated: number }>(
    `SELECT meter, day, ${QUARTER_PEAK} AS peak,
       minutes > COALESCE(apparent_minutes, 0) AS estimated
     FROM daily WHERE household_id = ? AND source = 'shelly' AND day >= ? AND day < ?`,
    householdId,
    ...range.days,
  );
  const byDay = new Map<string, DayPeak>();
  for (const row of [...parts.map((part) => ({ ...part, day: lisbonDate(part.ts) })), ...days]) {
    if (row.peak < 0) continue;
    const key = `${row.meter}|${row.day}`;
    const known = byDay.get(key);
    byDay.set(key, {
      meter: row.meter,
      day: row.day,
      peak: Math.max(known?.peak ?? 0, row.peak),
      estimated: (known?.estimated ?? false) || row.estimated === 1,
    });
  }
  return [...byDay.values()].sort(
    (a, b) => a.meter.localeCompare(b.meter) || a.day.localeCompare(b.day),
  );
}
