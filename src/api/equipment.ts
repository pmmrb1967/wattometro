// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Calls to the project's API, same-origin under /v1; every response is
 * validated with zod. What stays on, and the equipment register.
 */
import { z } from 'zod';
import { alwaysOnItemSchema, type AlwaysOnInput, type AlwaysOnItem } from '../domain/always-on';
import { equipmentSchema, type Equipment, type EquipmentInput } from '../domain/equipment';
import { type Failure, failure, send } from './client';

export async function fetchAlwaysOn(): Promise<{ ok: true; items: AlwaysOnItem[] } | Failure> {
  const response = await send('GET', '/v1/always-on');
  if (response?.ok) {
    const { items } = z.object({ items: z.array(alwaysOnItemSchema) }).parse(await response.json());
    return { ok: true, items };
  }
  return failure(response, []);
}

export async function createAlwaysOn(
  input: AlwaysOnInput,
): Promise<{ ok: true; item: AlwaysOnItem } | Failure> {
  const response = await send('POST', '/v1/always-on', input);
  if (response?.ok) {
    return {
      ok: true,
      item: z.object({ item: alwaysOnItemSchema }).parse(await response.json()).item,
    };
  }
  return failure(response, [400, 409]);
}

export async function updateAlwaysOn(
  id: string,
  input: AlwaysOnInput,
): Promise<{ ok: true } | Failure> {
  const response = await send('PUT', `/v1/always-on/${encodeURIComponent(id)}`, input);
  if (response?.ok) return { ok: true };
  return failure(response, [400, 404]);
}

export async function deleteAlwaysOn(id: string): Promise<{ ok: true } | Failure> {
  const response = await send('DELETE', `/v1/always-on/${encodeURIComponent(id)}`);
  if (response?.ok) return { ok: true };
  return failure(response, []);
}

/** Another equipment of the household has this name (any case). */
export type NameTaken = { ok: false; reason: 'nameTaken' } | { ok: false; reason: 'tooMany' };

const Conflict = z.object({ error: z.enum(['name_taken', 'too_many']) });

/**
 * What a 409 answer says: the name taken or the register full. Read from a
 * clone (failure() may read it too) and before failure(), which in the
 * demonstration takes any 409 for "not in the demonstration".
 */
async function conflict(response: Response | null): Promise<NameTaken | null> {
  if (response?.status !== 409) return null;
  const parsed = Conflict.safeParse(
    await response
      .clone()
      .json()
      .catch(() => null),
  );
  if (!parsed.success) return null;
  return { ok: false, reason: parsed.data.error === 'name_taken' ? 'nameTaken' : 'tooMany' };
}

/** The house's equipment (server/src/repo/equipment.ts), by name. */
export async function fetchEquipment(): Promise<{ ok: true; items: Equipment[] } | Failure> {
  const response = await send('GET', '/v1/equipment');
  if (response?.ok) {
    const { items } = z.object({ items: z.array(equipmentSchema) }).parse(await response.json());
    return { ok: true, items };
  }
  return failure(response, []);
}

export async function createEquipment(
  input: EquipmentInput,
): Promise<{ ok: true; item: Equipment } | NameTaken | Failure> {
  const response = await send('POST', '/v1/equipment', input);
  if (response?.ok) {
    return {
      ok: true,
      item: z.object({ item: equipmentSchema }).parse(await response.json()).item,
    };
  }
  const refused = await conflict(response);
  if (refused) return refused;
  return failure(response, [400, 409]);
}

/** A new name renames the appliances linked to it and their calibrations. */
export async function updateEquipment(
  id: string,
  input: EquipmentInput,
): Promise<{ ok: true } | NameTaken | Failure> {
  const response = await send('PUT', `/v1/equipment/${encodeURIComponent(id)}`, input);
  if (response?.ok) return { ok: true };
  const refused = await conflict(response);
  if (refused) return refused;
  return failure(response, [400, 404]);
}

/** Links the appliances of these names (any case); they take the equipment's name. */
export async function linkEquipment(
  id: string,
  labels: readonly string[],
): Promise<{ ok: true } | Failure> {
  const response = await send('POST', `/v1/equipment/${encodeURIComponent(id)}/link`, {
    labels,
  });
  if (response?.ok) return { ok: true };
  return failure(response, [400, 404]);
}

/** The linked appliances stay, unlinked. */
export async function deleteEquipment(id: string): Promise<{ ok: true } | Failure> {
  const response = await send('DELETE', `/v1/equipment/${encodeURIComponent(id)}`);
  if (response?.ok) return { ok: true };
  return failure(response, []);
}
