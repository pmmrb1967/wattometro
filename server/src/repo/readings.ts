// SPDX-License-Identifier: AGPL-3.0-or-later
/** Shelly readings: readings_1m (aggregates) and readings_1s (per-second BLOB). */
import type { Sql, Statement } from '../db';

export interface MinuteReading {
  /** Start of the minute, epoch seconds (multiple of 60). */
  ts: number;
  channel: number;
  samples: number;
  energyWh: number;
  powerAvgW: number;
  powerMinW: number;
  powerMaxW: number;
  voltageMinDv: number;
  voltageAvgDv: number;
  voltageMaxDv: number;
  pfAvgPct: number;
  /** Highest one-second apparent power, VA; null without per-second values. */
  apparentMaxVa: number | null;
  /** docs/readings-1s.md; null when the device sent the aggregate only. */
  seconds: Uint8Array | null;
}

/**
 * Statements that store one minute. A minute already stored is left as it was
 * (a resend changes nothing); its per-second row and apparent peak are still
 * added if they were missing. The first statement's change count says whether the minute was new.
 */
export function minuteStatements(
  device: { id: string; householdId: string },
  minute: MinuteReading,
): Statement[] {
  const statements: Statement[] = [
    {
      query: `INSERT INTO readings_1m (device_id, channel, ts, household_id, samples, energy_wh,
        power_avg_w, power_min_w, power_max_w, voltage_min_dv, voltage_avg_dv, voltage_max_dv, pf_avg_pct,
        apparent_max_va)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
      params: [
        device.id,
        minute.channel,
        minute.ts,
        device.householdId,
        minute.samples,
        minute.energyWh,
        minute.powerAvgW,
        minute.powerMinW,
        minute.powerMaxW,
        minute.voltageMinDv,
        minute.voltageAvgDv,
        minute.voltageMaxDv,
        minute.pfAvgPct,
        minute.apparentMaxVa,
      ],
    },
  ];
  if (minute.apparentMaxVa !== null) {
    // A minute first sent without its per-second values gets its apparent peak now.
    statements.push({
      query: `UPDATE readings_1m SET apparent_max_va = ?
        WHERE device_id = ? AND channel = ? AND ts = ? AND apparent_max_va IS NULL`,
      params: [minute.apparentMaxVa, device.id, minute.channel, minute.ts],
    });
  }
  if (minute.seconds) {
    statements.push({
      query: `INSERT INTO readings_1s (device_id, channel, ts, household_id, data)
        VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
      params: [device.id, minute.channel, minute.ts, device.householdId, minute.seconds],
    });
  }
  return statements;
}

/**
 * The minutes of [from, to) a device's channel has no row for, as [start, end)
 * ranges: what to fill from the Shelly's own minute log. Reads the rows it
 * has, by primary key: at most one per minute of the span.
 */
export async function missingMinutes(
  sql: Sql,
  householdId: string,
  deviceId: string,
  channel: number,
  from: number,
  to: number,
): Promise<[number, number][]> {
  const rows = await sql.all<{ ts: number }>(
    `SELECT ts FROM readings_1m
     WHERE device_id = ? AND channel = ? AND ts >= ? AND ts < ? AND household_id = ?
     ORDER BY ts`,
    deviceId,
    channel,
    from,
    to,
    householdId,
  );
  const ranges: [number, number][] = [];
  let next = from;
  for (const { ts } of [...rows, { ts: to }]) {
    if (ts > next) ranges.push([next, ts]);
    next = Math.max(next, ts + 60);
  }
  return ranges;
}
