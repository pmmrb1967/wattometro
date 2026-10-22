// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Sql, Statement } from '../db';

export interface Device {
  id: string;
  householdId: string;
  name: string;
  model: string | null;
  firmware: string | null;
  scriptVersion: string | null;
  createdAt: number;
  lastSeenAt: number | null;
  revokedAt: number | null;
}

/** A device as ingest sees it: with its request counter for the current minute. */
export interface IngestDevice extends Device {
  /** Start of the minute rateCount refers to (epoch seconds), or null before the first request. */
  rateWindow: number | null;
  rateCount: number;
}

export interface NewDevice {
  householdId: string;
  name: string;
  model?: string;
  /** SHA-256 of the token (hex); see auth.ts. */
  tokenHash: string;
}

interface DeviceRow {
  id: string;
  household_id: string;
  name: string;
  model: string | null;
  firmware: string | null;
  script_version: string | null;
  created_at: number;
  last_seen_at: number | null;
  revoked_at: number | null;
}

interface IngestDeviceRow extends DeviceRow {
  rate_window: number | null;
  rate_count: number;
}

/** Never selects token_hash: it is only compared inside SQL. */
const COLUMNS =
  'id, household_id, name, model, firmware, script_version, created_at, last_seen_at, revoked_at';

const fromRow = (row: DeviceRow): Device => ({
  id: row.id,
  householdId: row.household_id,
  name: row.name,
  model: row.model,
  firmware: row.firmware,
  scriptVersion: row.script_version,
  createdAt: row.created_at,
  lastSeenAt: row.last_seen_at,
  revokedAt: row.revoked_at,
});

export async function createDevice(sql: Sql, device: NewDevice, now: number): Promise<Device> {
  const id = crypto.randomUUID();
  await sql.run(
    'INSERT INTO devices (id, household_id, name, model, token_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    id,
    device.householdId,
    device.name,
    device.model ?? null,
    device.tokenHash,
    now,
  );
  return {
    id,
    householdId: device.householdId,
    name: device.name,
    model: device.model ?? null,
    firmware: null,
    scriptVersion: null,
    createdAt: now,
    lastSeenAt: null,
    revokedAt: null,
  };
}

export async function listDevices(sql: Sql, householdId: string): Promise<Device[]> {
  const rows = await sql.all<DeviceRow>(
    `SELECT ${COLUMNS} FROM devices WHERE household_id = ? ORDER BY created_at, id`,
    householdId,
  );
  return rows.map(fromRow);
}

/** The device a token belongs to, unless it was revoked. */
export async function findActiveDeviceByTokenHash(
  sql: Sql,
  tokenHash: string,
): Promise<IngestDevice | null> {
  const row = await sql.first<IngestDeviceRow>(
    `SELECT ${COLUMNS}, rate_window, rate_count FROM devices WHERE token_hash = ? AND revoked_at IS NULL`,
    tokenHash,
  );
  return row ? { ...fromRow(row), rateWindow: row.rate_window, rateCount: row.rate_count } : null;
}

export interface DeviceReport {
  now: number;
  model: string | null;
  firmware: string | null;
  scriptVersion: string;
  rateWindow: number;
  rateCount: number;
}

/** Records an ingest request; runs in the same batch as the readings it brought. */
export function deviceSeenStatement(deviceId: string, report: DeviceReport): Statement {
  return {
    query: `UPDATE devices SET last_seen_at = ?, model = COALESCE(?, model), firmware = COALESCE(?, firmware),
      script_version = ?, rate_window = ?, rate_count = ? WHERE id = ?`,
    params: [
      report.now,
      report.model,
      report.firmware,
      report.scriptVersion,
      report.rateWindow,
      report.rateCount,
      deviceId,
    ],
  };
}

/** Scoped by household, so one household can never revoke another's device. */
export async function revokeDevice(
  sql: Sql,
  householdId: string,
  deviceId: string,
  now: number,
): Promise<void> {
  await sql.run(
    'UPDATE devices SET revoked_at = ? WHERE id = ? AND household_id = ? AND revoked_at IS NULL',
    now,
    deviceId,
    householdId,
  );
}
