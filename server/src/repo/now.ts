// SPDX-License-Identifier: AGPL-3.0-or-later
/** What the "Agora" page shows: the latest minute and today so far, per meter. */
import type { Sql } from '../db';

export interface LatestMinute {
  ts: number;
  powerAvgW: number;
  powerMinW: number;
  powerMaxW: number;
  voltageAvgDv: number;
  voltageMinDv: number;
  voltageMaxDv: number;
  pfAvgPct: number;
}

export interface MeterToday {
  deviceId: string;
  channel: number;
  minutes: number;
  energyWh: number;
  powerMaxW: number;
}

/** Minutes since `since` (today's start in Lisbon), per device and channel. */
export async function todayByMeter(
  sql: Sql,
  householdId: string,
  since: number,
): Promise<MeterToday[]> {
  const rows = await sql.all<{
    device_id: string;
    channel: number;
    minutes: number;
    energy_wh: number;
    power_max_w: number;
  }>(
    `SELECT device_id, channel, COUNT(*) AS minutes, SUM(energy_wh) AS energy_wh,
       MAX(power_max_w) AS power_max_w
     FROM readings_1m WHERE household_id = ? AND ts >= ?
     GROUP BY device_id, channel ORDER BY device_id, channel`,
    householdId,
    since,
  );
  return rows.map((row) => ({
    deviceId: row.device_id,
    channel: row.channel,
    minutes: row.minutes,
    energyWh: row.energy_wh,
    powerMaxW: row.power_max_w,
  }));
}

/** Scoped by household: a device id from elsewhere finds nothing. */
export async function latestMinute(
  sql: Sql,
  householdId: string,
  deviceId: string,
  channel: number,
): Promise<LatestMinute | null> {
  const row = await sql.first<{
    ts: number;
    power_avg_w: number;
    power_min_w: number;
    power_max_w: number;
    voltage_avg_dv: number;
    voltage_min_dv: number;
    voltage_max_dv: number;
    pf_avg_pct: number;
  }>(
    `SELECT ts, power_avg_w, power_min_w, power_max_w, voltage_avg_dv, voltage_min_dv,
       voltage_max_dv, pf_avg_pct
     FROM readings_1m WHERE device_id = ? AND channel = ? AND household_id = ?
     ORDER BY ts DESC LIMIT 1`,
    deviceId,
    channel,
    householdId,
  );
  return row
    ? {
        ts: row.ts,
        powerAvgW: row.power_avg_w,
        powerMinW: row.power_min_w,
        powerMaxW: row.power_max_w,
        voltageAvgDv: row.voltage_avg_dv,
        voltageMinDv: row.voltage_min_dv,
        voltageMaxDv: row.voltage_max_dv,
        pfAvgPct: row.pf_avg_pct,
      }
    : null;
}
