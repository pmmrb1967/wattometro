// SPDX-License-Identifier: AGPL-3.0-or-later
/** Power quality (docs/voltage.md): Shelly boots → outages, 10-minute voltage, zone. */
import type { Sql, Statement } from '../db';

/** A boot time read again (script restart, clock rounding) is the same boot. */
export const BOOT_TOLERANCE_SECONDS = 10;

/**
 * How far back the minute before a boot is looked for. Longer without data is
 * not a power cut (the Shelly was unplugged, or the device is new): no outage.
 */
export const OUTAGE_LOOKBACK_SECONDS = 7 * 86_400;

/**
 * Records a boot of the device, once. The outage starts at the end of the last
 * minute stored before the boot; it must run before the payload's own minutes,
 * which may start before the boot (the minute in progress when it booted).
 */
export function bootStatement(
  device: { id: string; householdId: string },
  bootAt: number,
): Statement {
  return {
    // The last minute before the boot, walking the (household_id, ts) index back from it:
    // a few rows, and never more than OUTAGE_LOOKBACK_SECONDS of the house's minutes (a new
    // device has none). MAX(ts) by device_id alone (the primary key starts with device_id,
    // channel) read every minute the device ever sent.
    query: `INSERT INTO outages (device_id, boot_at, household_id, start_at)
      SELECT ?, ?, ?, (SELECT ts + 60 FROM readings_1m
        WHERE household_id = ? AND ts >= ? AND ts < ? AND device_id = ?
        ORDER BY ts DESC LIMIT 1)
      WHERE NOT EXISTS (SELECT 1 FROM outages WHERE device_id = ? AND boot_at BETWEEN ? AND ?)`,
    params: [
      device.id,
      bootAt,
      device.householdId,
      device.householdId,
      bootAt - OUTAGE_LOOKBACK_SECONDS,
      bootAt,
      device.id,
      device.id,
      bootAt - BOOT_TOLERANCE_SECONDS,
      bootAt + BOOT_TOLERANCE_SECONDS,
    ],
  };
}

export interface Outage {
  deviceId: string;
  /** The Shelly booted: power was back (a few seconds before). */
  bootAt: number;
  /** End of the last minute before; null when there was none (not an outage). */
  startAt: number | null;
  excluded: boolean;
}

/** Boots in [from, to), oldest first. */
export async function listOutages(
  sql: Sql,
  householdId: string,
  from: number,
  to: number,
): Promise<Outage[]> {
  const rows = await sql.all<{
    device_id: string;
    boot_at: number;
    start_at: number | null;
    excluded: number;
  }>(
    `SELECT device_id, boot_at, start_at, excluded FROM outages
     WHERE household_id = ? AND boot_at >= ? AND boot_at < ? ORDER BY boot_at, device_id`,
    householdId,
    from,
    to,
  );
  return rows.map((row) => ({
    deviceId: row.device_id,
    bootAt: row.boot_at,
    startAt: row.start_at,
    excluded: row.excluded === 1,
  }));
}

/** Scoped by household: another household's outage is left as it was. */
export async function setOutageExcluded(
  sql: Sql,
  householdId: string,
  deviceId: string,
  bootAt: number,
  excluded: boolean,
): Promise<void> {
  await sql.run(
    'UPDATE outages SET excluded = ? WHERE household_id = ? AND device_id = ? AND boot_at = ?',
    excluded ? 1 : 0,
    householdId,
    deviceId,
    bootAt,
  );
}

/** [ts, minutes, avg, min, max] per meter and 10 minutes in [from, to). */
export type VoltageInterval = [number, number, number, number, number];

export async function listVoltage10m(
  sql: Sql,
  householdId: string,
  from: number,
  to: number,
): Promise<{ meter: string; intervals: VoltageInterval[] }[]> {
  const rows = await sql.all<{
    meter: string;
    ts: number;
    minutes: number;
    voltage_avg_dv: number;
    voltage_min_dv: number;
    voltage_max_dv: number;
  }>(
    `SELECT meter, ts, minutes, voltage_avg_dv, voltage_min_dv, voltage_max_dv FROM voltage_10m
     WHERE household_id = ? AND ts >= ? AND ts < ? ORDER BY meter, ts`,
    householdId,
    from,
    to,
  );
  const meters = new Map<string, VoltageInterval[]>();
  for (const row of rows) {
    const list = meters.get(row.meter) ?? [];
    list.push([row.ts, row.minutes, row.voltage_avg_dv, row.voltage_min_dv, row.voltage_max_dv]);
    meters.set(row.meter, list);
  }
  return [...meters].map(([meter, intervals]) => ({ meter, intervals }));
}

/** [ts, min, max] of the minutes whose voltage left [lowDv, highDv]. */
export type MinuteOutside = [number, number, number];

export async function minutesOutside(
  sql: Sql,
  householdId: string,
  from: number,
  to: number,
  lowDv: number,
  highDv: number,
  limit: number,
): Promise<{ meter: string; minutes: MinuteOutside[] }[]> {
  const rows = await sql.all<{
    device_id: string;
    channel: number;
    ts: number;
    voltage_min_dv: number;
    voltage_max_dv: number;
  }>(
    `SELECT device_id, channel, ts, voltage_min_dv, voltage_max_dv FROM readings_1m
     WHERE household_id = ? AND ts >= ? AND ts < ? AND (voltage_min_dv < ? OR voltage_max_dv > ?)
     ORDER BY device_id, channel, ts LIMIT ?`,
    householdId,
    from,
    to,
    lowDv,
    highDv,
    limit,
  );
  const meters = new Map<string, MinuteOutside[]>();
  for (const row of rows) {
    const meter = `${row.device_id}:${row.channel}`;
    const list = meters.get(meter) ?? [];
    list.push([row.ts, row.voltage_min_dv, row.voltage_max_dv]);
    meters.set(meter, list);
  }
  return [...meters].map(([meter, minutes]) => ({ meter, minutes }));
}

export const QUALITY_ZONES = ['A', 'B', 'C'] as const;
export type QualityZone = (typeof QUALITY_ZONES)[number];

export async function getQualityZone(sql: Sql, householdId: string): Promise<QualityZone | null> {
  const row = await sql.first<{ quality_zone: QualityZone | null }>(
    'SELECT quality_zone FROM households WHERE id = ?',
    householdId,
  );
  return row?.quality_zone ?? null;
}

export async function setQualityZone(
  sql: Sql,
  householdId: string,
  zone: QualityZone | null,
): Promise<void> {
  await sql.run('UPDATE households SET quality_zone = ? WHERE id = ?', zone, householdId);
}
