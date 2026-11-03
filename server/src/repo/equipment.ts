// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The house's equipment (migration 0026, src/domain/equipment.ts) and the
 * appliances linked to it. The equipment's name governs: a linked appliance
 * takes it, and renaming the equipment renames, in one batch, its appliances
 * and the calibrations (signatures) named as they were.
 */
import { z } from 'zod';
import {
  ENERGY_CLASSES,
  EQUIPMENT_KINDS,
  MAX_EQUIPMENT,
  nameKey,
  programmeSchema,
  type Equipment,
  type EquipmentInput,
} from '../../../src/domain/equipment';
import type { Sql, Statement } from '../db';

interface Row {
  id: string;
  name: string;
  kind: string | null;
  brand: string | null;
  model: string | null;
  room: string | null;
  rated_power_w: number | null;
  energy_class: string | null;
  notes: string | null;
  programmes: string;
  created_at: number;
}

const Kind = z.enum(EQUIPMENT_KINDS).nullable();
const EnergyClass = z.enum(ENERGY_CLASSES).nullable();
const Programmes = z.array(programmeSchema);

const fromRow = (row: Row): Equipment => ({
  id: row.id,
  name: row.name,
  kind: Kind.parse(row.kind),
  brand: row.brand,
  model: row.model,
  room: row.room,
  ratedPowerW: row.rated_power_w,
  energyClass: EnergyClass.parse(row.energy_class),
  notes: row.notes,
  programmes: Programmes.parse(JSON.parse(row.programmes)),
  createdAt: row.created_at,
});

export async function listEquipment(sql: Sql, householdId: string): Promise<Equipment[]> {
  const rows = await sql.all<Row>(
    `SELECT id, name, kind, brand, model, room, rated_power_w, energy_class, notes, programmes,
       created_at
     FROM equipment WHERE household_id = ?`,
    householdId,
  );
  return rows.map(fromRow).sort((a, b) => a.name.localeCompare(b.name, 'pt'));
}

/** The household's equipment of this name (any case), if there is one. */
export async function equipmentNamed(
  sql: Sql,
  householdId: string,
  name: string,
): Promise<{ id: string; name: string } | null> {
  return sql.first<{ id: string; name: string }>(
    'SELECT id, name FROM equipment WHERE household_id = ? AND name_key = ?',
    householdId,
    nameKey(name),
  );
}

export async function createEquipment(
  sql: Sql,
  householdId: string,
  input: EquipmentInput,
  now: number,
): Promise<Equipment | 'too_many' | 'name_taken'> {
  const count = await sql.first<{ n: number }>(
    'SELECT COUNT(*) AS n FROM equipment WHERE household_id = ?',
    householdId,
  );
  if ((count?.n ?? 0) >= MAX_EQUIPMENT) return 'too_many';
  if (await equipmentNamed(sql, householdId, input.name)) return 'name_taken';
  const id = crypto.randomUUID();
  await sql.run(
    `INSERT INTO equipment (id, household_id, name, name_key, kind, brand, model, room,
       rated_power_w, energy_class, notes, programmes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    householdId,
    input.name,
    nameKey(input.name),
    input.kind,
    input.brand,
    input.model,
    input.room,
    input.ratedPowerW,
    input.energyClass,
    input.notes,
    JSON.stringify(input.programmes),
    now,
  );
  return { ...input, id, createdAt: now };
}

/**
 * The statement giving `name` to the household's calibrations named one of
 * `labels` in any case (SQLite's lower() leaves accents, so compared here);
 * null when there are none.
 */
export async function renameSignaturesStatement(
  sql: Sql,
  householdId: string,
  labels: readonly string[],
  name: string,
): Promise<Statement | null> {
  const keys = new Set(labels.map(nameKey));
  const rows = await sql.all<{ label: string }>(
    'SELECT DISTINCT label FROM signatures WHERE household_id = ?',
    householdId,
  );
  const matched = rows.map((row) => row.label).filter((label) => keys.has(nameKey(label)));
  if (matched.length === 0) return null;
  return {
    query: `UPDATE signatures SET label = ?
            WHERE household_id = ? AND label IN (${matched.map(() => '?').join(', ')})`,
    params: [name, householdId, ...matched],
  };
}

/**
 * Statements linking the appliances `linkIds` to `equipmentId` and giving
 * `name` to every appliance linked to it and to their calibrations (any case),
 * also those named `oldName`.
 */
async function linkedStatements(
  sql: Sql,
  householdId: string,
  equipmentId: string,
  name: string,
  linkIds: readonly string[],
  oldName: string | null,
): Promise<Statement[]> {
  const appliances = await sql.all<{ id: string; label: string; equipment_id: string | null }>(
    'SELECT id, label, equipment_id FROM appliances WHERE household_id = ?',
    householdId,
  );
  const linking = new Set(linkIds);
  const labels = appliances
    .filter((appliance) => appliance.equipment_id === equipmentId || linking.has(appliance.id))
    .map((appliance) => appliance.label);
  const signatures = await renameSignaturesStatement(
    sql,
    householdId,
    oldName === null ? labels : [...labels, oldName],
    name,
  );
  return [
    ...linkIds.map((applianceId) => ({
      query: 'UPDATE appliances SET equipment_id = ? WHERE id = ? AND household_id = ?',
      params: [equipmentId, applianceId, householdId],
    })),
    ...(signatures ? [signatures] : []),
    {
      query: 'UPDATE appliances SET label = ? WHERE household_id = ? AND equipment_id = ?',
      params: [name, householdId, equipmentId],
    },
  ];
}

/** The unlinked appliances of the household named `name` in any case. */
async function unlinkedNamed(sql: Sql, householdId: string, name: string): Promise<string[]> {
  const rows = await sql.all<{ id: string; label: string }>(
    'SELECT id, label FROM appliances WHERE household_id = ? AND equipment_id IS NULL',
    householdId,
  );
  const key = nameKey(name);
  return rows.filter((row) => nameKey(row.label) === key).map((row) => row.id);
}

export async function updateEquipment(
  sql: Sql,
  householdId: string,
  id: string,
  input: EquipmentInput,
): Promise<'ok' | 'not_found' | 'name_taken'> {
  const owner = await sql.first<{ name: string }>(
    'SELECT name FROM equipment WHERE id = ? AND household_id = ?',
    id,
    householdId,
  );
  if (!owner) return 'not_found';
  const other = await equipmentNamed(sql, householdId, input.name);
  if (other && other.id !== id) return 'name_taken';
  // Appliances already named as the new name are this equipment too ("named as an equipment links it").
  const linking = await unlinkedNamed(sql, householdId, input.name);
  const linked = await linkedStatements(sql, householdId, id, input.name, linking, owner.name);
  await sql.batch([
    {
      query: `UPDATE equipment SET name = ?, name_key = ?, kind = ?, brand = ?, model = ?,
                room = ?, rated_power_w = ?, energy_class = ?, notes = ?, programmes = ?
              WHERE id = ? AND household_id = ?`,
      params: [
        input.name,
        nameKey(input.name),
        input.kind,
        input.brand,
        input.model,
        input.room,
        input.ratedPowerW,
        input.energyClass,
        input.notes,
        JSON.stringify(input.programmes),
        id,
        householdId,
      ],
    },
    ...linked,
  ]);
  return 'ok';
}

/**
 * Links every appliance of the household named one of `labels` (any case),
 * whatever their names: they and their calibrations take the equipment's.
 * False when the equipment is not the household's.
 */
export async function linkEquipment(
  sql: Sql,
  householdId: string,
  id: string,
  labels: readonly string[],
): Promise<boolean> {
  const owner = await sql.first<{ name: string }>(
    'SELECT name FROM equipment WHERE id = ? AND household_id = ?',
    id,
    householdId,
  );
  if (!owner) return false;
  const wanted = new Set(labels.map(nameKey));
  const appliances = await sql.all<{ id: string; label: string }>(
    'SELECT id, label FROM appliances WHERE household_id = ?',
    householdId,
  );
  const chosen = appliances.filter((appliance) => wanted.has(nameKey(appliance.label)));
  if (chosen.length === 0) return true;
  await sql.batch(
    await linkedStatements(
      sql,
      householdId,
      id,
      owner.name,
      chosen.map((appliance) => appliance.id),
      null,
    ),
  );
  return true;
}

/** The linked appliances stay, with their names, unlinked. */
export async function deleteEquipment(sql: Sql, householdId: string, id: string): Promise<void> {
  await sql.batch([
    {
      query:
        'UPDATE appliances SET equipment_id = NULL WHERE household_id = ? AND equipment_id = ?',
      params: [householdId, id],
    },
    {
      query: 'DELETE FROM equipment WHERE id = ? AND household_id = ?',
      params: [id, householdId],
    },
  ]);
}

/** Whether `label` (any case) is the name of an appliance linked to an equipment. */
export async function isLinkedLabel(
  sql: Sql,
  householdId: string,
  label: string,
): Promise<boolean> {
  const rows = await sql.all<{ label: string }>(
    'SELECT DISTINCT label FROM appliances WHERE household_id = ? AND equipment_id IS NOT NULL',
    householdId,
  );
  const key = nameKey(label);
  return rows.some((row) => nameKey(row.label) === key);
}
