// SPDX-License-Identifier: AGPL-3.0-or-later
/** Shelly readings: readings_1m (aggregates) and readings_1s (per-second BLOB). */
import type { Statement } from '../db';

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
  /** docs/readings-1s.md; null when the device sent the aggregate only. */
  seconds: Uint8Array | null;
}

/**
 * Statements that store one minute. A minute already stored is left as it was
 * (a resend changes nothing); its per-second row is still added if it was
 * missing. The first statement's change count says whether the minute was new.
 */
export function minuteStatements(
  device: { id: string; householdId: string },
  minute: MinuteReading,
): Statement[] {
  const statements: Statement[] = [
    {
      query: `INSERT INTO readings_1m (device_id, channel, ts, household_id, samples, energy_wh,
        power_avg_w, power_min_w, power_max_w, voltage_min_dv, voltage_avg_dv, voltage_max_dv, pf_avg_pct)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
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
      ],
    },
  ];
  if (minute.seconds) {
    statements.push({
      query: `INSERT INTO readings_1s (device_id, channel, ts, household_id, data)
        VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
      params: [device.id, minute.channel, minute.ts, device.householdId, minute.seconds],
    });
  }
  return statements;
}
