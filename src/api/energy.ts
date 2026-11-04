// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Calls to the project's API, same-origin under /v1; every response is
 * validated with zod. The E-Redes import and the energy by day and quarter hour.
 */
import { z } from 'zod';
import type { DayEnergy } from '../domain/reconciliation';
import { type Failure, failure, int, send } from './client';

const EredesSummary = z.object({
  quarters: int,
  estimated: int,
  energyWh: int,
  from: int.nullable(),
  to: int.nullable(),
  /** Each day imported: [day, quarters, estimated] (null when not counted). */
  days: z.array(z.tuple([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), int.nullable(), int.nullable()])),
});

export type EredesSummary = z.infer<typeof EredesSummary>;

/** What was imported from E-Redes. */
export async function fetchEredesSummary(): Promise<
  { ok: true; summary: EredesSummary } | Failure
> {
  const response = await send('GET', '/v1/import/eredes');
  if (response?.ok) return { ok: true, summary: EredesSummary.parse(await response.json()) };
  return failure(response, []);
}

/** Quarter hours per request (30 days); the server takes up to 3000. */
export const EREDES_BATCH = 2880;

/** Sends one batch of quarter hours [start, Wh, estimated]; idempotent. */
export async function importEredesBatch(
  quarters: [number, number, 0 | 1][],
): Promise<{ ok: true; written: number } | Failure> {
  const response = await send('POST', '/v1/import/eredes', { quarters });
  if (response?.ok) {
    const { written } = z.object({ written: int }).parse(await response.json());
    return { ok: true, written };
  }
  return failure(response, [400, 413]);
}

export async function deleteEredesImport(): Promise<{ ok: true } | Failure> {
  const response = await send('DELETE', '/v1/import/eredes');
  if (response?.ok) return { ok: true };
  return failure(response, []);
}

const EnergyMeters = z.object({
  meters: z.array(z.object({ meter: z.string(), days: int, energyWh: int })),
});

export type EnergyMeter = z.infer<typeof EnergyMeters>['meters'][number];

/** Meters with data on the days of [from, to) (at most 400 days). */
export async function fetchEnergyMeters(
  from: number,
  to: number,
): Promise<{ ok: true; meters: EnergyMeter[] } | Failure> {
  const response = await send('GET', `/v1/energy?from=${from}&to=${to}`);
  if (response?.ok) return { ok: true, ...EnergyMeters.parse(await response.json()) };
  return failure(response, []);
}

export type { DayEnergy };

const DailyEnergy = z.object({
  days: z.array(
    z
      .tuple([z.string(), int])
      .rest(int.nullable())
      .transform(([date, wh, minutes]): DayEnergy => [date, wh, minutes ?? null]),
  ),
});

/** Energy of a meter per Lisbon day of [from, to), oldest first. */
export async function fetchDailyEnergy(
  meter: string,
  from: number,
  to: number,
): Promise<{ ok: true; days: DayEnergy[] } | Failure> {
  const query = new URLSearchParams({ meter, from: String(from), to: String(to) });
  const response = await send('GET', `/v1/energy/days?${query}`);
  if (response?.ok) return { ok: true, ...DailyEnergy.parse(await response.json()) };
  return failure(response, []);
}

/** Energy per quarter hour of a meter, decoded from its records (uint32 ts · uint32 Wh). */
export async function fetchQuarterEnergy(
  meter: string,
  from: number,
  to: number,
): Promise<{ ok: true; quarters: { ts: number; energyWh: number }[] } | Failure> {
  const query = new URLSearchParams({ meter, from: String(from), to: String(to) });
  const response = await send('GET', `/v1/energy/quarters?${query}`);
  if (!response?.ok) return failure(response, []);
  const view = new DataView(await response.arrayBuffer());
  const quarters: { ts: number; energyWh: number }[] = [];
  for (let offset = 0; offset + 8 <= view.byteLength; offset += 8) {
    quarters.push({ ts: view.getUint32(offset, true), energyWh: view.getUint32(offset + 4, true) });
  }
  return { ok: true, quarters };
}
