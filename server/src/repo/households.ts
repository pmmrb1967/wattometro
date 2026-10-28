// SPDX-License-Identifier: AGPL-3.0-or-later
import {
  installationSchema,
  UNKNOWN_INSTALLATION,
  type Installation,
} from '../../../src/domain/installation';
import type { Budget } from '../../../src/domain/budget';
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

interface InstallationRow {
  heating: string | null;
  air_conditioning: number | null;
  water_heating: string | null;
  hob: string | null;
  solar_panels: number | null;
  electric_car: number | null;
}

const flag = (value: number | null) => (value === null ? null : value === 1);
const toFlag = (value: boolean | null) => (value === null ? null : value ? 1 : 0);

/** What the household said about its installation; all unknown until saved. */
export async function getHouseholdInstallation(
  sql: Sql,
  householdId: string,
): Promise<Installation> {
  const row = await sql.first<InstallationRow>(
    `SELECT heating, air_conditioning, water_heating, hob, solar_panels, electric_car
       FROM household_installation WHERE household_id = ?`,
    householdId,
  );
  if (!row) return UNKNOWN_INSTALLATION;
  return installationSchema.parse({
    heating: row.heating === null ? null : row.heating.split(','),
    airConditioning: flag(row.air_conditioning),
    waterHeating: row.water_heating,
    hob: row.hob,
    solarPanels: flag(row.solar_panels),
    electricCar: flag(row.electric_car),
  });
}

export async function setHouseholdInstallation(
  sql: Sql,
  householdId: string,
  installation: Installation,
  now: number,
): Promise<void> {
  await sql.run(
    `INSERT INTO household_installation (household_id, heating, air_conditioning, water_heating,
       hob, solar_panels, electric_car, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (household_id) DO UPDATE SET heating = excluded.heating,
       air_conditioning = excluded.air_conditioning, water_heating = excluded.water_heating,
       hob = excluded.hob, solar_panels = excluded.solar_panels,
       electric_car = excluded.electric_car, updated_at = excluded.updated_at`,
    householdId,
    installation.heating?.join(',') ?? null,
    toFlag(installation.airConditioning),
    installation.waterHeating,
    installation.hob,
    toFlag(installation.solarPanels),
    toFlag(installation.electricCar),
    now,
  );
}

/** The month's budget (migration 0020); null without one. */
export async function getHouseholdBudget(sql: Sql, householdId: string): Promise<Budget | null> {
  const row = await sql.first<{ cents: number; wh_per_day: number }>(
    'SELECT cents, wh_per_day FROM household_budget WHERE household_id = ?',
    householdId,
  );
  return row ? { cents: row.cents, whPerDay: row.wh_per_day } : null;
}

/** Saves the budget, or removes it (null). */
export async function setHouseholdBudget(
  sql: Sql,
  householdId: string,
  budget: Budget | null,
  now: number,
): Promise<void> {
  if (!budget) {
    await sql.run('DELETE FROM household_budget WHERE household_id = ?', householdId);
    return;
  }
  await sql.run(
    `INSERT INTO household_budget (household_id, cents, wh_per_day, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (household_id) DO UPDATE SET cents = excluded.cents,
       wh_per_day = excluded.wh_per_day, updated_at = excluded.updated_at`,
    householdId,
    budget.cents,
    budget.whPerDay,
    now,
  );
}

/** Every household's id, for the Cron jobs. */
export async function listHouseholdIds(sql: Sql): Promise<string[]> {
  const rows = await sql.all<{ id: string }>('SELECT id FROM households ORDER BY id');
  return rows.map((row) => row.id);
}
