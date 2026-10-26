// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The house's named appliances (Phase 8.3, migration 0016): a label and the
 * descriptor the browser classifies cycles with (src/nilm/appliances.ts).
 */
import { z } from 'zod';
import type { Sql } from '../db';

/** More than a house names; keeps a runaway client from filling the table. */
export const MAX_APPLIANCES = 60;

export interface ApplianceInput {
  label: string;
  powerW: number;
  statesW: number[];
  pulsing: boolean;
}

export interface Appliance extends ApplianceInput {
  id: string;
  createdAt: number;
}

const States = z.array(z.number().int());

export async function listAppliances(sql: Sql, householdId: string): Promise<Appliance[]> {
  const rows = await sql.all<{
    id: string;
    label: string;
    power_w: number;
    states_w: string;
    pulsing: number;
    created_at: number;
  }>(
    `SELECT id, label, power_w, states_w, pulsing, created_at FROM appliances
     WHERE household_id = ? ORDER BY label`,
    householdId,
  );
  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    powerW: row.power_w,
    statesW: States.parse(JSON.parse(row.states_w)),
    pulsing: row.pulsing === 1,
    createdAt: row.created_at,
  }));
}

/** Null when the household already has MAX_APPLIANCES. */
export async function createAppliance(
  sql: Sql,
  householdId: string,
  input: ApplianceInput,
  now: number,
): Promise<Appliance | null> {
  const count = await sql.first<{ n: number }>(
    'SELECT COUNT(*) AS n FROM appliances WHERE household_id = ?',
    householdId,
  );
  if ((count?.n ?? 0) >= MAX_APPLIANCES) return null;
  const id = crypto.randomUUID();
  await sql.run(
    `INSERT INTO appliances (id, household_id, label, power_w, states_w, pulsing, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id,
    householdId,
    input.label,
    input.powerW,
    JSON.stringify(input.statesW),
    input.pulsing ? 1 : 0,
    now,
  );
  return { id, ...input, createdAt: now };
}

/** False when it is not the household's. */
export async function renameAppliance(
  sql: Sql,
  householdId: string,
  id: string,
  label: string,
): Promise<boolean> {
  const [changed = 0] = await sql.batch([
    {
      query: 'UPDATE appliances SET label = ? WHERE id = ? AND household_id = ?',
      params: [label, id, householdId],
    },
  ]);
  return changed > 0;
}

export async function deleteAppliance(sql: Sql, householdId: string, id: string): Promise<void> {
  await sql.run('DELETE FROM appliances WHERE id = ? AND household_id = ?', id, householdId);
}
