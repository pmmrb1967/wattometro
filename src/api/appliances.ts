// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Calls to the project's API, same-origin under /v1; every response is
 * validated with zod. Appliances: calibrations, named appliances and each day's cycles.
 */
import { z } from 'zod';
import { isDemo } from '../demo/mode';
import { type Failure, failure, int, send } from './client';

const Signature = z.object({
  id: z.string(),
  meter: z.string(),
  label: z.string(),
  from: int,
  to: int,
  minutes: int,
  createdAt: int,
});

export type Signature = z.infer<typeof Signature>;

/** The calibrations kept (server/src/repo/signatures.ts), the latest first. */
export async function fetchSignatures(): Promise<{ ok: true; signatures: Signature[] } | Failure> {
  const response = await send('GET', '/v1/signatures');
  if (response?.ok) {
    const { signatures } = z
      .object({ signatures: z.array(Signature) })
      .parse(await response.json());
    return { ok: true, signatures };
  }
  return failure(response, []);
}

/**
 * Keeps the per-second values of a marked run; `noSeconds` while the Shelly has
 * not sent those minutes yet (it sends each one after it ends).
 */
export async function createSignature(input: {
  meter: string;
  label: string;
  from: number;
  to: number;
}): Promise<{ ok: true; signature: Signature } | { ok: false; reason: 'noSeconds' } | Failure> {
  const response = await send('POST', '/v1/signatures', input);
  if (response?.ok) {
    return {
      ok: true,
      signature: z.object({ signature: Signature }).parse(await response.json()).signature,
    };
  }
  if (response?.status === 409 && !isDemo()) return { ok: false, reason: 'noSeconds' };
  return failure(response, [400, 404]);
}

export async function fetchSignatureSeconds(
  id: string,
): Promise<{ ok: true; records: ArrayBuffer } | Failure> {
  const response = await send('GET', `/v1/signatures/${encodeURIComponent(id)}/seconds`);
  if (response?.ok) return { ok: true, records: await response.arrayBuffer() };
  return failure(response, []);
}

/** Renames the appliance: every calibration with this one's label. */
export async function renameSignature(id: string, label: string): Promise<{ ok: true } | Failure> {
  const response = await send('PATCH', `/v1/signatures/${encodeURIComponent(id)}`, { label });
  if (response?.ok) return { ok: true };
  return failure(response, []);
}

export async function deleteSignature(id: string): Promise<{ ok: true } | Failure> {
  const response = await send('DELETE', `/v1/signatures/${encodeURIComponent(id)}`);
  if (response?.ok) return { ok: true };
  return failure(response, []);
}

const Appliance = z.object({
  id: z.string(),
  label: z.string(),
  powerW: int,
  statesW: z.array(int),
  pulsing: z.boolean(),
  minDurationS: int.nullable(),
  maxDurationS: int.nullable(),
  // Missing from a server before migration 0018 (a cached response).
  heats: int.nullable().default(null),
  // Missing from a server before migration 0026 (a cached response).
  equipmentId: z.string().nullable().default(null),
  // Missing before migration 0027.
  periodS: int.nullable().default(null),
  createdAt: int,
});

export type Appliance = z.infer<typeof Appliance>;

/** The appliances the house named (server/src/repo/appliances.ts). */
const NilmDayRow = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  version: z.number().int(),
  minutes: z.number().int(),
  data: z.string(),
});

export type NilmDayRow = z.infer<typeof NilmDayRow>;

/** The days' cycles kept on the server (src/nilm/stored.ts), from and to inclusive. */
export async function fetchNilmDays(
  meter: string,
  from: string,
  to: string,
): Promise<{ ok: true; days: NilmDayRow[] } | Failure> {
  const query = new URLSearchParams({ meter, from, to });
  const response = await send('GET', `/v1/nilm/days?${query}`);
  if (response?.ok) {
    const { days } = z.object({ days: z.array(NilmDayRow) }).parse(await response.json());
    return { ok: true, days };
  }
  return failure(response, []);
}

/** Keeps the days' cycles on the server, each replacing what was there. */
export async function saveNilmDays(
  meter: string,
  days: readonly NilmDayRow[],
): Promise<{ ok: true } | Failure> {
  const response = await send('PUT', '/v1/nilm/days', { meter, days });
  if (response?.ok) return { ok: true };
  return failure(response, []);
}

export async function fetchAppliances(): Promise<{ ok: true; appliances: Appliance[] } | Failure> {
  const response = await send('GET', '/v1/appliances');
  if (response?.ok) {
    const { appliances } = z
      .object({ appliances: z.array(Appliance) })
      .parse(await response.json());
    return { ok: true, appliances };
  }
  return failure(response, []);
}

export async function createAppliance(input: {
  label: string;
  powerW: number;
  statesW: number[];
  pulsing: boolean;
  minDurationS: number | null;
  maxDurationS: number | null;
  heats: number | null;
  periodS?: number | null;
}): Promise<{ ok: true; appliance: Appliance } | Failure> {
  const response = await send('POST', '/v1/appliances', input);
  if (response?.ok) {
    return {
      ok: true,
      appliance: z.object({ appliance: Appliance }).parse(await response.json()).appliance,
    };
  }
  return failure(response, [400, 409]);
}

/** A new name, or the durations widened by another programme. */
export async function updateAppliance(
  id: string,
  change: {
    label?: string;
    durations?: { minS: number; maxS: number };
    periodS?: number | null;
  },
): Promise<{ ok: true } | Failure> {
  const response = await send('PATCH', `/v1/appliances/${encodeURIComponent(id)}`, change);
  if (response?.ok) return { ok: true };
  return failure(response, [400, 404]);
}

export async function deleteAppliance(id: string): Promise<{ ok: true } | Failure> {
  const response = await send('DELETE', `/v1/appliances/${encodeURIComponent(id)}`);
  if (response?.ok) return { ok: true };
  return failure(response, []);
}
