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

/** Every household's id, for the Cron jobs. */
export async function listHouseholdIds(sql: Sql): Promise<string[]> {
  const rows = await sql.all<{ id: string }>('SELECT id FROM households ORDER BY id');
  return rows.map((row) => row.id);
}
