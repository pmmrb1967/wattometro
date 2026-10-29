// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Responses shaped as server/src/app.ts gives them, for the APIs answered in
 * the browser: the demonstration (server.ts) and the local mode
 * (src/local/server.ts).
 */
import { lisbonDate } from '../lib/time';

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
export const empty = (status = 204) => new Response(null, { status });
export const invalid = () => json({ error: 'invalid_request' }, 400);

/**
 * Energy per Lisbon day of quarter hours (GET /v1/energy/days, server/src/repo/eredes.ts),
 * with the minutes of a Shelly (its quarters are whole) or null for E-Redes.
 */
export function dailyEnergy(
  quarters: readonly (readonly [number, number, ...number[]])[],
  shelly = false,
): [string, number, number | null][] {
  const days = new Map<string, [number, number]>();
  for (const [ts, wh] of quarters) {
    const date = lisbonDate(ts);
    const [energy, count] = days.get(date) ?? [0, 0];
    days.set(date, [energy + wh, count + 1]);
  }
  return [...days].map(([date, [wh, count]]) => [date, wh, shelly ? count * 15 : null]);
}

/** Records of GET /v1/energy/quarters (server/src/repo/eredes.ts): uint32 ts · uint32 Wh. */
export function energyRecords(quarters: readonly (readonly [number, number, ...number[]])[]) {
  const records = new Uint8Array(quarters.length * 8);
  const view = new DataView(records.buffer);
  quarters.forEach(([ts, wh], index) => {
    view.setUint32(index * 8, ts, true);
    view.setUint32(index * 8 + 4, wh, true);
  });
  return new Response(records, { headers: { 'Content-Type': 'application/octet-stream' } });
}
