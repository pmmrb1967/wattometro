// SPDX-License-Identifier: AGPL-3.0-or-later
/** The household's electricity contracts (migration 0005). Always scoped by household. */
import type { Tariff, TariffInput } from '../../../src/domain/tariff';
import type { Sql } from '../db';

interface TariffRow {
  id: string;
  valid_from: string;
  supplier: string | null;
  power_va: number;
  option: Tariff['option'];
  cycle: Tariff['cycle'];
  periods_map: Tariff['periodsMap'];
  fixed_per_day: number;
  price_simple: number | null;
  price_off_empty: number | null;
  price_empty: number | null;
  price_full: number | null;
  price_peak: number | null;
  iec_per_kwh: number;
  cav_per_month: number;
  dgeg_per_month: number;
  large_family: number;
  energy_discount_bp: number;
  social_energy_per_kwh: number;
  social_power_per_day: number;
  social_financing_per_kwh: number;
}

const COLUMNS = `id, valid_from, supplier, power_va, option, cycle, periods_map, fixed_per_day,
  price_simple, price_off_empty, price_empty, price_full, price_peak, iec_per_kwh,
  cav_per_month, dgeg_per_month, large_family, energy_discount_bp, social_energy_per_kwh,
  social_power_per_day, social_financing_per_kwh`;

const optional = (value: number | null) => (value === null ? undefined : value);

const fromRow = (row: TariffRow): Tariff => {
  const energy: Tariff['energy'] = {};
  const prices = {
    simple: optional(row.price_simple),
    offEmpty: optional(row.price_off_empty),
    empty: optional(row.price_empty),
    full: optional(row.price_full),
    peak: optional(row.price_peak),
  };
  for (const [period, price] of Object.entries(prices) as [keyof typeof prices, number][]) {
    if (price !== undefined) energy[period] = price;
  }
  return {
    id: row.id,
    validFrom: row.valid_from,
    supplier: row.supplier,
    powerVa: row.power_va,
    option: row.option,
    cycle: row.cycle,
    periodsMap: row.periods_map,
    fixedPerDay: row.fixed_per_day,
    energy,
    iecPerKwh: row.iec_per_kwh,
    cavPerMonth: row.cav_per_month,
    dgegPerMonth: row.dgeg_per_month,
    largeFamily: row.large_family === 1,
    energyDiscountBp: row.energy_discount_bp,
    socialEnergyPerKwh: row.social_energy_per_kwh,
    socialPowerPerDay: row.social_power_per_day,
    socialFinancingPerKwh: row.social_financing_per_kwh,
  };
};

/** Oldest first. */
export async function listTariffs(sql: Sql, householdId: string): Promise<Tariff[]> {
  const rows = await sql.all<TariffRow>(
    `SELECT ${COLUMNS} FROM tariffs WHERE household_id = ? ORDER BY valid_from`,
    householdId,
  );
  return rows.map(fromRow);
}

/** Saves a contract; one that starts on the same day as an existing one replaces it. */
export async function saveTariff(
  sql: Sql,
  householdId: string,
  tariff: TariffInput,
  now: number,
): Promise<Tariff> {
  const id = crypto.randomUUID();
  await sql.run(
    `INSERT INTO tariffs (id, household_id, valid_from, supplier, power_va, option, cycle,
       periods_map, fixed_per_day, price_simple, price_off_empty, price_empty, price_full,
       price_peak, iec_per_kwh, cav_per_month, dgeg_per_month, large_family,
       energy_discount_bp, social_energy_per_kwh, social_power_per_day,
       social_financing_per_kwh, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (household_id, valid_from) DO UPDATE SET
       id = excluded.id, supplier = excluded.supplier, power_va = excluded.power_va,
       option = excluded.option, cycle = excluded.cycle, periods_map = excluded.periods_map,
       fixed_per_day = excluded.fixed_per_day, price_simple = excluded.price_simple,
       price_off_empty = excluded.price_off_empty, price_empty = excluded.price_empty,
       price_full = excluded.price_full, price_peak = excluded.price_peak,
       iec_per_kwh = excluded.iec_per_kwh, cav_per_month = excluded.cav_per_month,
       dgeg_per_month = excluded.dgeg_per_month, large_family = excluded.large_family,
       energy_discount_bp = excluded.energy_discount_bp,
       social_energy_per_kwh = excluded.social_energy_per_kwh,
       social_power_per_day = excluded.social_power_per_day,
       social_financing_per_kwh = excluded.social_financing_per_kwh,
       created_at = excluded.created_at`,
    id,
    householdId,
    tariff.validFrom,
    tariff.supplier,
    tariff.powerVa,
    tariff.option,
    tariff.cycle,
    tariff.periodsMap,
    tariff.fixedPerDay,
    tariff.energy.simple ?? null,
    tariff.energy.offEmpty ?? null,
    tariff.energy.empty ?? null,
    tariff.energy.full ?? null,
    tariff.energy.peak ?? null,
    tariff.iecPerKwh,
    tariff.cavPerMonth,
    tariff.dgegPerMonth,
    tariff.largeFamily ? 1 : 0,
    tariff.energyDiscountBp,
    tariff.socialEnergyPerKwh,
    tariff.socialPowerPerDay,
    tariff.socialFinancingPerKwh,
    now,
  );
  return { ...tariff, id };
}

/** Scoped by household: an id from elsewhere deletes nothing. */
export async function deleteTariff(sql: Sql, householdId: string, id: string): Promise<void> {
  await sql.run('DELETE FROM tariffs WHERE id = ? AND household_id = ?', id, householdId);
}
