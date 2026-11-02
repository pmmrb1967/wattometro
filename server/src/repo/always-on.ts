// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * What the household says stays on day and night (migration 0025,
 * src/domain/always-on.ts).
 */
import type { Sql } from '../db';

/** More than a house lists; keeps a runaway client from filling the table. */
export const MAX_ALWAYS_ON = 60;

export interface AlwaysOnInput {
  label: string;
  quantity: number;
  powerW: number | null;
  measured: boolean;
}

export interface AlwaysOnItem extends AlwaysOnInput {
  id: string;
  createdAt: number;
}

export async function listAlwaysOn(sql: Sql, householdId: string): Promise<AlwaysOnItem[]> {
  const rows = await sql.all<{
    id: string;
    label: string;
    quantity: number;
    power_w: number | null;
    measured: number;
    created_at: number;
  }>(
    `SELECT id, label, quantity, power_w, measured, created_at
     FROM always_on WHERE household_id = ? ORDER BY label`,
    householdId,
  );
  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    quantity: row.quantity,
    powerW: row.power_w,
    measured: row.measured === 1,
    createdAt: row.created_at,
  }));
}

/** Null when the household already has MAX_ALWAYS_ON. */
export async function createAlwaysOn(
  sql: Sql,
  householdId: string,
  input: AlwaysOnInput,
  now: number,
): Promise<AlwaysOnItem | null> {
  const count = await sql.first<{ n: number }>(
    'SELECT COUNT(*) AS n FROM always_on WHERE household_id = ?',
    householdId,
  );
  if ((count?.n ?? 0) >= MAX_ALWAYS_ON) return null;
  const id = crypto.randomUUID();
  await sql.run(
    `INSERT INTO always_on (id, household_id, label, quantity, power_w, measured, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id,
    householdId,
    input.label,
    input.quantity,
    input.powerW,
    input.measured ? 1 : 0,
    now,
  );
  return { id, ...input, createdAt: now };
}

/** False when it is not the household's. */
export async function updateAlwaysOn(
  sql: Sql,
  householdId: string,
  id: string,
  input: AlwaysOnInput,
): Promise<boolean> {
  const [changed = 0] = await sql.batch([
    {
      query: `UPDATE always_on SET label = ?, quantity = ?, power_w = ?, measured = ?
              WHERE id = ? AND household_id = ?`,
      params: [input.label, input.quantity, input.powerW, input.measured ? 1 : 0, id, householdId],
    },
  ]);
  return changed > 0;
}

export async function deleteAlwaysOn(sql: Sql, householdId: string, id: string): Promise<void> {
  await sql.run('DELETE FROM always_on WHERE id = ? AND household_id = ?', id, householdId);
}
