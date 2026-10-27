// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The house's named appliances (Phase 8.3, migrations 0016 to 0018): a label
 * and the descriptor the browser classifies cycles with
 * (src/nilm/appliances.ts), with the range of durations seen and, for a whole
 * programme, its number of heatings.
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
  /** Range of its cycles' durations, s; null matches any duration. */
  minDurationS: number | null;
  maxDurationS: number | null;
  /** Heatings of a whole programme (a dishwasher); null for anything else. */
  heats: number | null;
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
    min_duration_s: number | null;
    max_duration_s: number | null;
    heats: number | null;
    created_at: number;
  }>(
    `SELECT id, label, power_w, states_w, pulsing, min_duration_s, max_duration_s, heats,
       created_at
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
    `INSERT INTO appliances (id, household_id, label, power_w, states_w, pulsing,
       min_duration_s, max_duration_s, heats, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    householdId,
    input.label,
    input.powerW,
    JSON.stringify(input.statesW),
    input.pulsing ? 1 : 0,
    input.minDurationS,
    input.maxDurationS,
    input.heats,
    now,
  );
  return { id, ...input, createdAt: now };
}

/** A new name, or a new range of durations (another programme); false when not the household's. */
export async function updateAppliance(
  sql: Sql,
  householdId: string,
  id: string,
  change: { label?: string; durations?: { minS: number; maxS: number } },
): Promise<boolean> {
  const [changed = 0] = await sql.batch([
    {
      query: `UPDATE appliances SET label = COALESCE(?, label),
                min_duration_s = COALESCE(?, min_duration_s),
                max_duration_s = COALESCE(?, max_duration_s)
              WHERE id = ? AND household_id = ?`,
      params: [
        change.label ?? null,
        change.durations?.minS ?? null,
        change.durations?.maxS ?? null,
        id,
        householdId,
      ],
    },
  ]);
  return changed > 0;
}

export async function deleteAppliance(sql: Sql, householdId: string, id: string): Promise<void> {
  await sql.run('DELETE FROM appliances WHERE id = ? AND household_id = ?', id, householdId);
}
