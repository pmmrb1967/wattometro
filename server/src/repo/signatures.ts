// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Appliance signatures (Phase 8.2, migration 0013): the minutes the user
 * marked while an appliance ran, copied from readings_1s (90 days) so they
 * stay. The copy is one INSERT … SELECT on the primary key: at most
 * MAX_SIGNATURE_SECONDS / 60 + 2 rows read.
 */
import type { Sql } from '../db';
import { packRecords } from './seconds';

/** The longest run marked at once: a washing machine's programme, an oven. */
export const MAX_SIGNATURE_SECONDS = 4 * 3600;
/** Copied beyond each side of what was marked, so the on and off steps are inside. */
const MARGIN_SECONDS = 60;

export interface Signature {
  id: string;
  meter: string;
  label: string;
  from: number;
  to: number;
  minutes: number;
  createdAt: number;
}

/** The minutes copied for a marked run: whole minutes, one more on each side. */
export function signatureMinutes(from: number, to: number): { first: number; end: number } {
  return {
    first: Math.floor(from / 60) * 60 - MARGIN_SECONDS,
    end: Math.ceil(to / 60) * 60 + MARGIN_SECONDS,
  };
}

/** Null when the device is not the household's or no minute has per-second values yet. */
export async function createSignature(
  sql: Sql,
  householdId: string,
  input: { deviceId: string; channel: number; label: string; from: number; to: number },
  now: number,
): Promise<Signature | null> {
  const device = await sql.first<{ id: string }>(
    'SELECT id FROM devices WHERE id = ? AND household_id = ?',
    input.deviceId,
    householdId,
  );
  if (!device) return null;
  const id = crypto.randomUUID();
  const { first, end } = signatureMinutes(input.from, input.to);
  const [, copied = 0] = await sql.batch([
    {
      query: `INSERT INTO signatures
                (id, household_id, device_id, channel, label, start_at, end_at, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        id,
        householdId,
        input.deviceId,
        input.channel,
        input.label,
        input.from,
        input.to,
        now,
      ],
    },
    {
      query: `INSERT INTO signature_seconds (signature_id, ts, household_id, data)
              SELECT ?, ts, household_id, data FROM readings_1s
              WHERE device_id = ? AND channel = ? AND ts >= ? AND ts < ? AND household_id = ?`,
      params: [id, input.deviceId, input.channel, first, end, householdId],
    },
  ]);
  if (copied === 0) {
    await deleteSignature(sql, householdId, id);
    return null;
  }
  return {
    id,
    meter: `${input.deviceId}:${input.channel}`,
    label: input.label,
    from: input.from,
    to: input.to,
    minutes: copied,
    createdAt: now,
  };
}

export async function listSignatures(sql: Sql, householdId: string): Promise<Signature[]> {
  const rows = await sql.all<{
    id: string;
    device_id: string;
    channel: number;
    label: string;
    start_at: number;
    end_at: number;
    created_at: number;
    minutes: number;
  }>(
    `SELECT s.id, s.device_id, s.channel, s.label, s.start_at, s.end_at, s.created_at,
       (SELECT COUNT(*) FROM signature_seconds c WHERE c.signature_id = s.id) AS minutes
     FROM signatures s WHERE s.household_id = ? ORDER BY s.start_at DESC`,
    householdId,
  );
  return rows.map((row) => ({
    id: row.id,
    meter: `${row.device_id}:${row.channel}`,
    label: row.label,
    from: row.start_at,
    to: row.end_at,
    minutes: row.minutes,
    createdAt: row.created_at,
  }));
}

/** The copied minutes as records (repo/seconds.ts); null for another household's signature. */
export async function signatureRecords(
  sql: Sql,
  householdId: string,
  id: string,
): Promise<Uint8Array | null> {
  const owner = await sql.first<{ id: string }>(
    'SELECT id FROM signatures WHERE id = ? AND household_id = ?',
    id,
    householdId,
  );
  if (!owner) return null;
  const rows = await sql.all<{ ts: number; data: ArrayBuffer | Uint8Array }>(
    'SELECT ts, data FROM signature_seconds WHERE signature_id = ? AND household_id = ? ORDER BY ts',
    id,
    householdId,
  );
  return packRecords(rows);
}

export async function deleteSignature(sql: Sql, householdId: string, id: string): Promise<void> {
  await sql.batch([
    {
      query: 'DELETE FROM signature_seconds WHERE signature_id = ? AND household_id = ?',
      params: [id, householdId],
    },
    { query: 'DELETE FROM signatures WHERE id = ? AND household_id = ?', params: [id, householdId] },
  ]);
}
