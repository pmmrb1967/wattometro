// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Physical units are always integers: energy in Wh, power in W, voltage in
 * decivolts (0.1 V), temperature in tenths of a degree Celsius. All conversions
 * live here; never add kWh as floats.
 */
export type Wh = number;
export type Watts = number;
export type Decivolts = number;
export type TenthsCelsius = number;

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
/** Between a number and its unit: no line break inside "6,9 kVA" (as the euro amounts). */
const UNIT_SPACE = '\u00a0';

export function formatKwh(wh: Wh, digits = 1): string {
  assertInteger(wh, 'Wh');
  return `${decimal(digits).format(wh / 1000)}${UNIT_SPACE}kWh`;
}

/** Average power over a quarter hour from its energy (Wh × 4 = W). */
export function quarterAverageW(wh: Wh): Watts {
  assertInteger(wh, 'Wh');
  return wh * 4;
}

const upTo = (digits: number) => new Intl.NumberFormat('pt-PT', { maximumFractionDigits: digits });

/** A chart axis value without its unit (the axis names it): W, or kW (e.g. 1500 → "1,5"). */
export function powerTick(watts: Watts, inKw: boolean): string {
  assertInteger(watts, 'W');
  return inKw ? upTo(2).format(watts / 1000) : upTo(0).format(watts);
}

/** A chart axis value in kWh, without the unit (e.g. 2500 → "2,5"). */
export function kwhTick(wh: Wh): string {
  assertInteger(wh, 'Wh');
  return upTo(3).format(wh / 1000);
}

/** Power for display only: W below 1 kW, kW with two decimals above (e.g. 3450 → "3,45 kW"). */
export function formatPower(watts: Watts): string {
  assertInteger(watts, 'W');
  return Math.abs(watts) < 1000
    ? `${decimal(0).format(watts)}${UNIT_SPACE}W`
    : `${decimal(2).format(watts / 1000)}${UNIT_SPACE}kW`;
}

/** Voltage for display only (e.g. 2305 → "230,5 V"). */
export function formatVolts(decivolts: Decivolts): string {
  assertInteger(decivolts, 'dV');
  return `${decimal(1).format(decivolts / 10)}${UNIT_SPACE}V`;
}

/** Contracted power for display only (e.g. 6900 VA → "6,9 kVA", 10350 → "10,35 kVA"). */
export function formatKva(va: number): string {
  assertInteger(va, 'VA');
  return `${new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 2 }).format(va / 1000)}${UNIT_SPACE}kVA`;
}

/** °C as received (e.g. from Open-Meteo, one decimal) → tenths of a degree (12.3 → 123). */
export function toTenthsCelsius(celsius: number): TenthsCelsius {
  return Math.round(celsius * 10);
}

/** Temperature for display only (e.g. 123 → "12,3 °C"). */
export function formatCelsius(tenths: TenthsCelsius, digits = 1): string {
  assertInteger(tenths, '0.1 °C');
  return `${decimal(digits).format(tenths / 10)}${UNIT_SPACE}°C`;
}

/** "16,5" (or "16.5", "16") → 165 tenths; null unless a non-negative number with one decimal at most. */
export function parsePtTenths(text: string): number | null {
  const match = /^\s*(\d{1,5})(?:[.,](\d))?\s*$/.exec(text);
  if (!match) return null;
  return Number(match[1]) * 10 + Number(match[2] ?? 0);
}

/** A power held for one hour (PVGIS's hourly PV power, docs/pvgis.md) as whole Wh. */
export function hourWh(watts: number): Wh {
  return Math.max(0, Math.round(watts));
}
