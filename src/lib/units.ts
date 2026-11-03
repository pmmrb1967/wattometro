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

/** "0,458" (or "0.458", "2") kWh → 458 Wh; null unless non-negative with three decimals at most. */
export function parseKwhToWh(text: string): Wh | null {
  const match = /^\s*(\d{1,3})(?:[.,](\d{1,3}))?\s*$/.exec(text);
  if (!match) return null;
  return Number(match[1]) * 1000 + Number((match[2] ?? '').padEnd(3, '0'));
}

/** Wh as a kWh field holds them (458 → "0,458"). */
export function formatKwhField(wh: Wh): string {
  assertInteger(wh, 'Wh');
  return decimal(3)
    .format(wh / 1000)
    .replace(/\s/g, '');
}

/** A whole number and its decimal digits scaled by 10^digits ("2", "1", 3 → 2100), without floats. */
function scaledDecimal(whole: string, fraction: string, digits: number): number {
  const kept = fraction.slice(0, digits).padEnd(digits, '0');
  const roundUp = fraction.length > digits && Number(fraction[digits]) >= 5 ? 1 : 0;
  return Number(whole) * 10 ** digits + Number(kept === '' ? '0' : kept) + roundUp;
}

/**
 * Spaces between thousands, the no-break ones too (\s covers them): "1 850" →
 * "1850"; not after a letter or a decimal ("IPX4 230 W" stays two numbers).
 */
const joinThousands = (text: string) =>
  text.replace(/(?<![\w.,])(\d{1,3})\s+(?=\d{3}(?!\d))/g, '$1');

/** A number printed in W or kW, as W: "2,1" kW, "2100" W, "2.200" W (a thousands point). */
function printedWatts(number: string, kilo: boolean): number {
  const [whole = '0', fraction = ''] = number.split(/[.,]/);
  return kilo || fraction.length === 3
    ? scaledDecimal(whole, fraction, 3)
    : scaledDecimal(whole, fraction, 0);
}

/**
 * A power as a plate or a manual prints it ("2100 W", "2,1 kW"); a range
 * ("1850-2200 W") gives its top, the plate's ceiling. Null without W or kW
 * (a voltage, a word).
 */
export function parsePrintedPowerW(text: string): number | null {
  const pattern =
    /(\d+(?:[.,]\d+)?)(?:\s*[-–/]\s*(\d+(?:[.,]\d+)?))?\s*(kW|W(?:atts?)?)(?![a-z])/gi;
  const values = [...joinThousands(text).matchAll(pattern)].flatMap((match) => {
    const kilo = /^k/i.test(match[3] as string);
    return [match[1], match[2]]
      .filter((value): value is string => value !== undefined)
      .map((value) => printedWatts(value, kilo));
  });
  const top = values.length === 0 ? 0 : Math.max(...values);
  return top > 0 ? top : null;
}

/**
 * An energy as a manual prints it ("0,46 kWh", "458 Wh"), as Wh; without a
 * unit, kWh. Null for an energy per 100 cycles, per year or per 1000 h (the
 * energy label's): not one cycle's.
 */
export function parsePrintedEnergyWh(text: string): Wh | null {
  const match = /(\d+(?:[.,]\d+)?)\s*(kWh|Wh)?(\s*\/\s*(?:\d|ano|annum|year))?/i.exec(
    joinThousands(text),
  );
  if (!match || match[3] !== undefined) return null;
  const [whole = '0', fraction = ''] = (match[1] as string).split(/[.,]/);
  const inWh = match[2]?.toLowerCase() === 'wh';
  return inWh && fraction.length !== 3
    ? scaledDecimal(whole, fraction, 0)
    : scaledDecimal(whole, fraction, 3);
}

/** A power held for one hour (PVGIS's hourly PV power, docs/pvgis.md) as whole Wh. */
export function hourWh(watts: number): Wh {
  return Math.max(0, Math.round(watts));
}
