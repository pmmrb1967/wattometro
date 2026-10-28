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

export interface MeterQuarter {
  deviceId: string;
  channel: number;
  /** Start of the quarter hour (epoch seconds). */
  ts: number;
  minutes: number;
  energyWh: number;
  powerMaxW: number | null;
}

/**
 * Today's quarter hours per meter: those the Cron has rolled up (before
 * `cutoff`, a quarter-hour boundary) from readings_15m, the rest straight from
 * the minutes. Reading all of today's minutes on every refresh cost ~3000 rows
 * a minute while "Início" was open. Lisbon's offset is whole hours, so UTC
 * quarter hours are local quarter hours (src/lib/time.ts).
 */
export async function todayQuarters(
  sql: Sql,
  householdId: string,
  since: number,
  cutoff: number,
): Promise<MeterQuarter[]> {
  const rows = await sql.all<{
    meter: string;
    ts: number;
    minutes: number;
    energy_wh: number;
    power_max_w: number | null;
  }>(
    `SELECT meter, ts, minutes, energy_wh, power_max_w FROM readings_15m
     WHERE household_id = ? AND ts >= ? AND ts < ? AND source = 'shelly'
     UNION ALL
     SELECT device_id || ':' || channel, ts - ts % 900, COUNT(*), SUM(energy_wh), MAX(power_max_w)
     FROM readings_1m WHERE household_id = ? AND ts >= ?
     GROUP BY device_id, channel, ts - ts % 900
     ORDER BY 1, 2`,
    householdId,
    since,
    cutoff,
    householdId,
    cutoff,
  );
  return rows.map((row) => {
    const split = row.meter.lastIndexOf(':');
    return {
      deviceId: row.meter.slice(0, split),
      channel: Number(row.meter.slice(split + 1)),
      ts: row.ts,
      minutes: row.minutes,
      energyWh: row.energy_wh,
      powerMaxW: row.power_max_w,
    };
  });
}
