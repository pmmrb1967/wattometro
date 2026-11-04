// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Calls to the project's API, same-origin under /v1; every response is
 * validated with zod. The Shelly devices and their tokens.
 */
import { z } from 'zod';
import { type Failure, failure, send } from './client';

const Device = z.object({
  id: z.string(),
  name: z.string(),
  model: z.string().nullable(),
  firmware: z.string().nullable(),
  scriptVersion: z.string().nullable(),
  createdAt: z.number().int(),
  lastSeenAt: z.number().int().nullable(),
});

export type Device = z.infer<typeof Device>;

export async function fetchDevices(): Promise<{ ok: true; devices: Device[] } | Failure> {
  const response = await send('GET', '/v1/devices');
  if (response?.ok) {
    return {
      ok: true,
      devices: z.object({ devices: z.array(Device) }).parse(await response.json()).devices,
    };
  }
  return failure(response, []);
}

/** The token comes only in this response: the server keeps just its hash. */
export async function createDevice(
  name: string,
): Promise<{ ok: true; device: Device; token: string } | Failure> {
  const response = await send('POST', '/v1/devices', { name });
  if (response?.ok) {
    const created = z.object({ device: Device, token: z.string() }).parse(await response.json());
    return { ok: true, ...created };
  }
  return failure(response, [400]);
}

export async function renameDevice(id: string, name: string): Promise<{ ok: true } | Failure> {
  const response = await send('PUT', `/v1/devices/${encodeURIComponent(id)}`, { name });
  if (response?.ok) return { ok: true };
  return failure(response, [400]);
}

export async function revokeDevice(id: string): Promise<{ ok: true } | Failure> {
  const response = await send('DELETE', `/v1/devices/${encodeURIComponent(id)}`);
  if (response?.ok) return { ok: true };
  return failure(response, []);
}
