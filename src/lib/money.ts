// SPDX-License-Identifier: AGPL-3.0-or-later
// Adapted from Faturómetro (src/lib/money.ts).
/** Monetary amounts are always integer cents. All conversions live here. */
export type Cents = number;

const PT_AMOUNT = /^(-)?(\d{1,3}(?:[. ]\d{3})+|\d+)(?:,(\d{1,2}))?$/;
const DOT_DECIMAL_AMOUNT = /^(-)?(\d+)(?:\.(\d{1,2}))?$/;

function toCents(
  sign: string | undefined,
  integerPart: string,
  decimals: string | undefined,
): Cents {
  const cents = Number(integerPart) * 100 + Number((decimals ?? '').padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError(`Amount out of range: ${integerPart}`);
  }
  return sign ? -cents : cents;
}

/**
 * Parses an amount as printed on Portuguese invoices: comma decimal separator,
 * optional dot or space thousands separators and optional euro sign
 * (e.g. "1.234,56 €"). Returns null when the text is not an amount.
 */
export function parsePtAmount(text: string): Cents | null {
  const normalized = text
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/€|EUR/gi, '')
    .trim();
  const match = PT_AMOUNT.exec(normalized);
  if (!match) return null;
  const [, sign, integerPart = '', decimals] = match;
  return toCents(sign, integerPart.replace(/[. ]/g, ''), decimals);
}

/**
 * Parses a machine-formatted amount with a dot decimal separator and no
 * thousands separator (e.g. "1234.56", as in the fiscal QR code).
 */
export function parseDotDecimalAmount(text: string): Cents | null {
  const match = DOT_DECIMAL_AMOUNT.exec(text.trim());
  if (!match) return null;
  const [, sign, integerPart = '', decimals] = match;
  return toCents(sign, integerPart, decimals);
}

export function sumCents(values: readonly Cents[]): Cents {
  let total = 0;
  for (const value of values) {
    if (!Number.isInteger(value)) throw new TypeError(`Not integer cents: ${value}`);
    total += value;
  }
  if (!Number.isSafeInteger(total)) throw new RangeError('Sum out of range');
  return total;
}

/** Whole euros, rounded up (e.g. 3990 → 40): for "up to what you pay" limits. */
export function wholeEurosUp(cents: Cents): number {
  if (!Number.isInteger(cents)) throw new TypeError(`Not integer cents: ${cents}`);
  return Math.ceil(cents / 100);
}

/** Cents as text for an input field, without the euro sign (e.g. 3999 → "39,99"). */
export function centsToPtInput(cents: Cents): string {
  if (!Number.isInteger(cents)) throw new TypeError(`Not integer cents: ${cents}`);
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}

const EUR_FORMAT = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });

/** Formats cents for display only (e.g. "1234,56 €"). */
export function formatCents(cents: Cents): string {
  return EUR_FORMAT.format(cents / 100);
}

const WHOLE_EUR_FORMAT = new Intl.NumberFormat('pt-PT', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

/** Rounded to whole euros, for estimates (e.g. 6249 → "62 €", 6250 → "63 €"). */
export function formatWholeEuros(cents: Cents): string {
  if (!Number.isInteger(cents)) throw new TypeError(`Not integer cents: ${cents}`);
  return WHOLE_EUR_FORMAT.format(Math.round(cents / 100));
}

/**
 * Unit prices (€/kWh, €/day) need more precision than cents: integer
 * micro-euros, 1 € = 1 000 000 µ€ (e.g. 0,1665 €/kWh → 166 500).
 */
export type MicroEuros = number;

const PT_PRICE = /^(\d{1,4})(?:[,.](\d{1,6}))?$/;

/** "0,1665" (or "0.1665", with an optional euro sign) → 166500; null if not a price. */
export function parsePtPrice(text: string): MicroEuros | null {
  const match = PT_PRICE.exec(text.replace(/€/g, '').trim());
  if (!match) return null;
  const [, integerPart = '', decimals = ''] = match;
  return Number(integerPart) * 1_000_000 + Number(decimals.padEnd(6, '0'));
}

/** Hundredths of a percent (basis points): 400 = 4 %. */
export type BasisPoints = number;

const PT_PERCENT = /^(\d{1,3})(?:[,.](\d{1,2}))?$/;

/** "4" or "4,5 %" → 400 / 450; null if not a percentage up to 100 % with 2 decimals. */
export function parsePtPercent(text: string): BasisPoints | null {
  const match = PT_PERCENT.exec(text.replace(/%/g, '').trim());
  if (!match) return null;
  const [, integerPart = '', decimals = ''] = match;
  const bp = Number(integerPart) * 100 + Number(decimals.padEnd(2, '0'));
  return bp <= 10_000 ? bp : null;
}

/** Basis points as text for an input field (450 → "4,5"). */
export function bpToPtInput(bp: BasisPoints): string {
  const decimals = String(bp % 100)
    .padStart(2, '0')
    .replace(/0+$/, '');
  return decimals === '' ? String(Math.floor(bp / 100)) : `${Math.floor(bp / 100)},${decimals}`;
}

/** A decimal price as published (ERSE offers) → micro-euros. */
export function eurosToMicro(euros: number): MicroEuros {
  const micro = Math.round(euros * 1_000_000);
  if (!Number.isSafeInteger(micro)) throw new RangeError(`Price out of range: ${euros}`);
  return micro;
}

/** Micro-euros as text for an input field, without trailing zeros (e.g. 166500 → "0,1665"). */
export function microToPtInput(micro: MicroEuros): string {
  if (!Number.isSafeInteger(micro) || micro < 0) throw new TypeError(`Not a price: ${micro}`);
  const decimals = String(micro % 1_000_000)
    .padStart(6, '0')
    .replace(/0+$/, '');
  return `${Math.floor(micro / 1_000_000)},${decimals.padEnd(2, '0')}`;
}

/** Round half up of numerator / denominator, for non-negative integers (exact, with BigInt). */
export function divideRounded(numerator: bigint, denominator: bigint): bigint {
  if (numerator < 0n || denominator <= 0n) throw new RangeError('divideRounded: negative');
  return (numerator * 2n + denominator) / (denominator * 2n);
}

/** Nano-euros (Wh × µ€/kWh) → cents, rounded half up. */
export function nanoToCents(nano: bigint): Cents {
  return Number(divideRounded(nano, 10_000_000n));
}
