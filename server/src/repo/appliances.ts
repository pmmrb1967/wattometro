// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The house's named appliances (Phase 8.3, migrations 0016 to 0018): a label
 * and the descriptor the browser classifies cycles with
 * (src/nilm/appliances.ts), with the range of durations seen and, for a whole
 * programme, its number of heatings.
 */
import { z } from 'zod';
import type { Sql } from '../db';
import { equipmentNamed, renameSignaturesStatement } from './equipment';

/** More than a house names; keeps a runaway client from filling the table. */
export const MAX_APPLIANCES = 60;

export interface ApplianceInput {
  label: string;
  powerW: number;
  statesW: number[];
  pulsing: boolean;
  /** Range of its cycles' durations, s; null matches any duration. */
  minDurationS: number | null;
  maxDurationS: number | null;
  /** Heatings of a whole programme (a dishwasher); null for anything else. */
  heats: number | null;
}

export interface Appliance extends ApplianceInput {
  id: string;
  /** The equipment it is linked to (repo/equipment.ts), whose name it has; null when none. */
  equipmentId: string | null;
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
    min_duration_s: number | null;
    max_duration_s: number | null;
    heats: number | null;
    equipment_id: string | null;
    created_at: number;
  }>(
    `SELECT id, label, power_w, states_w, pulsing, min_duration_s, max_duration_s, heats,
       equipment_id, created_at
     FROM appliances WHERE household_id = ? ORDER BY label`,
    householdId,
  );
  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    powerW: row.power_w,
    statesW: States.parse(JSON.parse(row.states_w)),
    pulsing: row.pulsing === 1,
    minDurationS: row.min_duration_s,
    maxDurationS: row.max_duration_s,
    heats: row.heats,
    equipmentId: row.equipment_id,
    createdAt: row.created_at,
  }));
}

/**
 * Null when the household already has MAX_APPLIANCES. Named as an equipment
 * (any case), it is linked to it and takes its exact name.
 */
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
  const equipment = await equipmentNamed(sql, householdId, input.label);
  const label = equipment?.name ?? input.label;
  const equipmentId = equipment?.id ?? null;
  await sql.run(
    `INSERT INTO appliances (id, household_id, label, power_w, states_w, pulsing,
       min_duration_s, max_duration_s, heats, equipment_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    householdId,
    label,
    input.powerW,
    JSON.stringify(input.statesW),
    input.pulsing ? 1 : 0,
    input.minDurationS,
    input.maxDurationS,
    input.heats,
    equipmentId,
    now,
  );
  // Linked: its calibrations, typed in another case, take the equipment's name too.
  if (equipment) {
    const signatures = await renameSignaturesStatement(sql, householdId, [input.label], label);
    if (signatures) await sql.batch([signatures]);
  }
  return { id, ...input, label, equipmentId, createdAt: now };
}

/**
 * A new name, or a new range of durations (another programme). A linked
 * appliance keeps the equipment's name ('linked': the equipment is renamed
 * instead); a name that is an equipment's links it.
 */
export async function updateAppliance(
  sql: Sql,
  householdId: string,
  id: string,
  change: { label?: string; durations?: { minS: number; maxS: number } },
): Promise<'ok' | 'not_found' | 'linked'> {
  const owner = await sql.first<{ equipment_id: string | null }>(
    'SELECT equipment_id FROM appliances WHERE id = ? AND household_id = ?',
    id,
    householdId,
  );
  if (!owner) return 'not_found';
  let label = change.label ?? null;
  let equipmentId = owner.equipment_id;
  let signatures = null;
  if (label !== null) {
    if (owner.equipment_id !== null) return 'linked';
    const equipment = await equipmentNamed(sql, householdId, label);
    if (equipment) {
      signatures = await renameSignaturesStatement(sql, householdId, [label], equipment.name);
      label = equipment.name;
      equipmentId = equipment.id;
    }
  }
  await sql.batch([
    ...(signatures ? [signatures] : []),
    {
      query: `UPDATE appliances SET label = COALESCE(?, label),
                min_duration_s = COALESCE(?, min_duration_s),
                max_duration_s = COALESCE(?, max_duration_s),
                equipment_id = ?
              WHERE id = ? AND household_id = ?`,
      params: [
        label,
        change.durations?.minS ?? null,
        change.durations?.maxS ?? null,
        equipmentId,
        id,
        householdId,
      ],
    },
  ]);
  return 'ok';
}

export async function deleteAppliance(sql: Sql, householdId: string, id: string): Promise<void> {
  await sql.run('DELETE FROM appliances WHERE id = ? AND household_id = ?', id, householdId);
}
