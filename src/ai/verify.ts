// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The code computes, the AI explains (CLAUDE.md): every quantity in an answer
 * (a number with €, kWh, kW, W, kVA, V or %) must appear in what the tools
 * returned. Those that do not are shown to the user as not confirmed by the
 * app, and fail the evaluation (scripts/ai-eval.ts).
 */
import type { ToolCall } from './provider';

/**
 * A pt-PT number: "12 345,6" (space-like thousands separators, as
 * Intl.NumberFormat writes them), "1234,5", "0,43", "-12".
 */
const NUMBER = '-?\\d{1,3}(?:[ \\u00a0\\u202f]\\d{3})+(?:,\\d+)?|-?\\d+(?:,\\d+)?';
const QUANTITY = new RegExp(`(${NUMBER})\\s*(€|kWh|kVA|kW|W|V|%)`, 'g');
const ANY_NUMBER = new RegExp(NUMBER, 'g');

/** "12 345,50" → "12345,5"; "-12" → "12" (sign, separators and trailing zeros do not matter). */
function canonical(number: string): string {
  let digits = number.replace(/^-/, '').replace(/[\s\u00a0\u202f]/g, '');
  if (digits.includes(',')) digits = digits.replace(/0+$/, '').replace(/,$/, '');
  return digits;
}

function numbersIn(value: unknown, into: Set<string>): void {
  if (typeof value === 'number') {
    into.add(canonical(String(Math.abs(value)).replace('.', ',')));
  } else if (typeof value === 'string') {
    for (const match of value.matchAll(ANY_NUMBER)) into.add(canonical(match[0]));
  } else if (Array.isArray(value)) {
    for (const item of value) numbersIn(item, into);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) numbersIn(item, into);
  }
}

/** The quantities in `text` that no tool returned, as written. */
export function unconfirmedQuantities(text: string, calls: readonly ToolCall[]): string[] {
  const known = new Set<string>();
  for (const call of calls) if (call.outcome.ok) numbersIn(call.outcome.result, known);
  const missing: string[] = [];
  for (const match of text.matchAll(QUANTITY)) {
    if (!known.has(canonical(match[1]!))) missing.push(match[0].replace(/\s+/g, ' ').trim());
  }
  return [...new Set(missing)];
}
