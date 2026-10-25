// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The per-second values of a meter (readings_1s; docs/readings-1s.md) for the
 * event detection in the browser (src/nilm/). One primary-key range: a Lisbon
 * day is at most 1500 rows. The Worker only copies the stored bytes.
 */
import { READINGS_1S_BYTES } from '../../../src/lib/readings-1s';
import type { Sql } from '../db';

/** Record, little-endian: uint32 ts (start of the minute) · 361 bytes readings_1s. */
export const SECONDS_RECORD_BYTES = 4 + READINGS_1S_BYTES;

export async function secondsRecords(
  sql: Sql,
  householdId: string,
  deviceId: string,
  channel: number,
  from: number,
  to: number,
): Promise<Uint8Array> {
  const rows = await sql.all<{ ts: number; data: ArrayBuffer | Uint8Array }>(
    `SELECT ts, data FROM readings_1s
     WHERE device_id = ? AND channel = ? AND ts >= ? AND ts < ? AND household_id = ?
     ORDER BY ts`,
    deviceId,
    channel,
    from,
    to,
    householdId,
  );
  return packRecords(rows);
}

/** Rows of (ts, readings_1s bytes) as records; rows of another length are left out. */
export function packRecords(rows: readonly { ts: number; data: ArrayBuffer | Uint8Array }[]) {
  const kept = rows
    .map((row) => ({ ts: row.ts, data: new Uint8Array(row.data) }))
    .filter((row) => row.data.byteLength === READINGS_1S_BYTES);
  const records = new Uint8Array(kept.length * SECONDS_RECORD_BYTES);
  const view = new DataView(records.buffer);
  kept.forEach((row, index) => {
    view.setUint32(index * SECONDS_RECORD_BYTES, row.ts, true);
    records.set(row.data, index * SECONDS_RECORD_BYTES + 4);
  });
  return records;
}
