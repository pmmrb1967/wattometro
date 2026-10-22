// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Physical units are always integers: energy in Wh, power in W, voltage in
 * decivolts (0.1 V). All conversions live here; never add kWh as floats.
 */
export type Wh = number;
export type Watts = number;
export type Decivolts = number;

function assertInteger(value: number, unit: string): void {
  if (!Number.isInteger(value)) throw new TypeError(`Not integer ${unit}: ${value}`);
}

export function sumWh(values: readonly Wh[]): Wh {
  let total = 0;
  for (const value of values) {
    assertInteger(value, 'Wh');
    total += value;
  }
  if (!Number.isSafeInteger(total)) throw new RangeError('Sum out of range');
  return total;
}

/** Whole kWh, rounded to the nearest (e.g. 1499 → 1, 1500 → 2): for limits and tiers. */
export function roundedKwh(wh: Wh): number {
  assertInteger(wh, 'Wh');
  return Math.round(wh / 1000);
}

const decimal = (digits: number) =>
  new Intl.NumberFormat('pt-PT', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Energy for display only (e.g. 12345 → "12,3 kWh"). */
export function formatKwh(wh: Wh, digits = 1): string {
  assertInteger(wh, 'Wh');
  return `${decimal(digits).format(wh / 1000)} kWh`;
}

/** Power for display only: W below 1 kW, kW with two decimals above (e.g. 3450 → "3,45 kW"). */
export function formatPower(watts: Watts): string {
  assertInteger(watts, 'W');
  return Math.abs(watts) < 1000
    ? `${decimal(0).format(watts)} W`
    : `${decimal(2).format(watts / 1000)} kW`;
}

/** Voltage for display only (e.g. 2305 → "230,5 V"). */
export function formatVolts(decivolts: Decivolts): string {
  assertInteger(decivolts, 'dV');
  return `${decimal(1).format(decivolts / 10)} V`;
}

/** Contracted power for display only (e.g. 6900 VA → "6,9 kVA", 10350 → "10,35 kVA"). */
export function formatKva(va: number): string {
  assertInteger(va, 'VA');
  return `${new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 2 }).format(va / 1000)} kVA`;
}
