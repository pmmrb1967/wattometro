// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Sql } from '../db';

export interface Household {
  id: string;
  name: string;
  createdAt: number;
}

interface HouseholdRow {
  id: string;
  name: string;
  created_at: number;
}

const fromRow = (row: HouseholdRow): Household => ({
  id: row.id,
  name: row.name,
  createdAt: row.created_at,
});

export async function createHousehold(sql: Sql, name: string, now: number): Promise<Household> {
  const household = { id: crypto.randomUUID(), name, createdAt: now };
  await sql.run(
    'INSERT INTO households (id, name, created_at) VALUES (?, ?, ?)',
    household.id,
    household.name,
    household.createdAt,
  );
  return household;
}

export async function getHousehold(sql: Sql, id: string): Promise<Household | null> {
  const row = await sql.first<HouseholdRow>(
    'SELECT id, name, created_at FROM households WHERE id = ?',
    id,
  );
  return row ? fromRow(row) : null;
}

export async function renameHousehold(sql: Sql, id: string, name: string): Promise<void> {
  await sql.run('UPDATE households SET name = ? WHERE id = ?', name, id);
}

/** The locality of the house, for the weather (docs/open-meteo.md). */
export interface HouseholdLocation {
  name: string;
  /** Hundredths of a degree (~1 km). */
  latitudeCdeg: number;
  longitudeCdeg: number;
}

export async function getHouseholdLocation(
  sql: Sql,
  householdId: string,
): Promise<HouseholdLocation | null> {
  const row = await sql.first<{
    location_name: string | null;
    latitude_cdeg: number | null;
    longitude_cdeg: number | null;
  }>(
    'SELECT location_name, latitude_cdeg, longitude_cdeg FROM households WHERE id = ?',
    householdId,
  );
  if (row?.location_name == null || row.latitude_cdeg == null || row.longitude_cdeg == null) {
    return null;
  }
  return {
    name: row.location_name,
    latitudeCdeg: row.latitude_cdeg,
    longitudeCdeg: row.longitude_cdeg,
  };
}

/** Sets the locality, or clears it with null. */
export async function setHouseholdLocation(
  sql: Sql,
  householdId: string,
  location: HouseholdLocation | null,
): Promise<void> {
  await sql.run(
    'UPDATE households SET location_name = ?, latitude_cdeg = ?, longitude_cdeg = ? WHERE id = ?',
    location?.name ?? null,
    location?.latitudeCdeg ?? null,
    location?.longitudeCdeg ?? null,
    householdId,
  );
}

/** Every household's id, for the Cron jobs. */
export async function listHouseholdIds(sql: Sql): Promise<string[]> {
  const rows = await sql.all<{ id: string }>('SELECT id FROM households ORDER BY id');
  return rows.map((row) => row.id);
}
