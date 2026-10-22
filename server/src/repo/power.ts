// SPDX-License-Identifier: AGPL-3.0-or-later
/** Contracted power (docs/contracted-power.md): peaks per meter, minute and quarter hour. */
import { READINGS_1S_BYTES } from '../../../src/lib/readings-1s';
import type { Sql } from '../db';

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

export async function powerByMeter(
  sql: Sql,
  householdId: string,
  from: number,
  to: number,
): Promise<MeterPower[]> {
  const rows = await sql.all<{
    device_id: string;
    channel: number;
    minutes: number;
    apparent_minutes: number;
    apparent_max_va: number | null;
    active_max_w: number | null;
    active_only_max_w: number | null;
  }>(
    `SELECT device_id, channel, COUNT(*) AS minutes, COUNT(apparent_max_va) AS apparent_minutes,
       MAX(apparent_max_va) AS apparent_max_va, MAX(power_max_w) AS active_max_w,
       MAX(CASE WHEN apparent_max_va IS NULL THEN power_max_w END) AS active_only_max_w
     FROM readings_1m WHERE household_id = ? AND ts >= ? AND ts < ?
     GROUP BY device_id, channel ORDER BY device_id, channel`,
    householdId,
    from,
    to,
  );
  return rows.map((row) => ({
    meter: `${row.device_id}:${row.channel}`,
    minutes: row.minutes,
    apparentMinutes: row.apparent_minutes,
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

/** The `limit` quarter hours of a meter with the highest one-second power, highest first. */
export async function topQuarters(
  sql: Sql,
  householdId: string,
  deviceId: string,
  channel: number,
  from: number,
  to: number,
  limit: number,
): Promise<QuarterPeak[]> {
  const rows = await sql.all<{ ts: number; peak: number; estimated: number }>(
    `SELECT ts - ts % 900 AS ts, MAX(COALESCE(apparent_max_va, power_max_w)) AS peak,
       MAX(apparent_max_va IS NULL) AS estimated
     FROM readings_1m
     WHERE household_id = ? AND device_id = ? AND channel = ? AND ts >= ? AND ts < ?
     GROUP BY ts - ts % 900 ORDER BY peak DESC, ts LIMIT ?`,
    householdId,
    deviceId,
    channel,
    from,
    to,
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
     WHERE household_id = ? AND source = 'eredes' AND ts >= ? AND ts < ?`,
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
  from: number,
  to: number,
  threshold: number,
  limit: number,
): Promise<{ records: Uint8Array; count: number; truncated: boolean }> {
  const rows = await sql.all<{
    ts: number;
    power_max_w: number;
    apparent_max_va: number | null;
    data: ArrayBuffer | Uint8Array | null;
  }>(
    `SELECT m.ts, m.power_max_w, m.apparent_max_va, s.data
     FROM readings_1m m
     LEFT JOIN readings_1s s ON s.device_id = m.device_id AND s.channel = m.channel AND s.ts = m.ts
     WHERE m.household_id = ? AND m.device_id = ? AND m.channel = ? AND m.ts >= ? AND m.ts < ?
       AND COALESCE(m.apparent_max_va, m.power_max_w) > ?
     ORDER BY m.ts LIMIT ?`,
    householdId,
    deviceId,
    channel,
    from,
    to,
    threshold,
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
