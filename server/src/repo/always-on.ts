// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * What the household says stays on day and night (migrations 0025 and 0030,
 * src/domain/always-on.ts), each linked to the registered equipment it is,
 * when it is one (src/domain/always-on-links.ts).
 */
import { linkByName, relinkAlwaysOn } from '../../../src/domain/always-on-links';
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
  equipmentId: string | null;
  createdAt: number;
}

const equipmentNames = (sql: Sql, householdId: string) =>
  sql.all<{ id: string; name: string }>(
    'SELECT id, name FROM equipment WHERE household_id = ?',
    householdId,
  );

async function readAlwaysOn(sql: Sql, householdId: string): Promise<AlwaysOnItem[]> {
  const rows = await sql.all<{
    id: string;
    label: string;
    quantity: number;
    power_w: number | null;
    measured: number;
    equipment_id: string | null;
    created_at: number;
  }>(
    `SELECT id, label, quantity, power_w, measured, equipment_id, created_at
     FROM always_on WHERE household_id = ? ORDER BY label`,
    householdId,
  );
  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    quantity: row.quantity,
    powerW: row.power_w,
    measured: row.measured === 1,
    equipmentId: row.equipment_id,
    createdAt: row.created_at,
  }));
}

/**
 * The links brought in line with the equipment (after a change to it, and on
 * reading: the items named as an equipment before migration 0030); only the
 * items that change are written. The items as they now are.
 */
export async function relinkAlwaysOnItems(sql: Sql, householdId: string): Promise<AlwaysOnItem[]> {
  const items = await readAlwaysOn(sql, householdId);
  if (items.length === 0) return items;
  const next = relinkAlwaysOn(items, await equipmentNames(sql, householdId));
  const changed = next.filter((item, index) => item !== items[index]);
  if (changed.length > 0) {
    await sql.batch(
      changed.map((item) => ({
        query: 'UPDATE always_on SET label = ?, equipment_id = ? WHERE id = ? AND household_id = ?',
        params: [item.label, item.equipmentId, item.id, householdId],
      })),
    );
  }
  return next.sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
}

export const listAlwaysOn = relinkAlwaysOnItems;

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
  const { label, equipmentId } = linkByName(input.label, await equipmentNames(sql, householdId));
  await sql.run(
    `INSERT INTO always_on (id, household_id, label, quantity, power_w, measured, equipment_id,
       created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    householdId,
    label,
    input.quantity,
    input.powerW,
    input.measured ? 1 : 0,
    equipmentId,
    now,
  );
  return { id, ...input, label, equipmentId, createdAt: now };
}

/** The item as stored (its name an equipment's when it is one); null when it is not the household's. */
export async function updateAlwaysOn(
  sql: Sql,
  householdId: string,
  id: string,
  input: AlwaysOnInput,
): Promise<{ label: string; equipmentId: string | null } | null> {
  const link = linkByName(input.label, await equipmentNames(sql, householdId));
  const [changed = 0] = await sql.batch([
    {
      query: `UPDATE always_on SET label = ?, quantity = ?, power_w = ?, measured = ?,
                equipment_id = ?
              WHERE id = ? AND household_id = ?`,
      params: [
        link.label,
        input.quantity,
        input.powerW,
        input.measured ? 1 : 0,
        link.equipmentId,
        id,
        householdId,
      ],
    },
  ]);
  return changed > 0 ? link : null;
}

export async function deleteAlwaysOn(sql: Sql, householdId: string, id: string): Promise<void> {
  await sql.run('DELETE FROM always_on WHERE id = ? AND household_id = ?', id, householdId);
}
