// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Calls to the project's API, same-origin under /v1; every response is
 * validated with zod. Voltage quality and outages.
 */
import { z } from 'zod';
import { type Failure, failure, int, send } from './client';

const Zone = z.enum(['A', 'B', 'C']);

const Quality = z.object({
  zone: Zone.nullable(),
  devices: z.array(z.object({ id: z.string(), name: z.string() })),
  /** [ts, minutes, avgDv, minDv, maxDv] per 10 minutes. */
  intervals: z.array(
    z.object({ meter: z.string(), intervals: z.array(z.tuple([int, int, int, int, int])) }),
  ),
  /** [ts, minDv, maxDv] of the minutes outside the band. */
  outside: z.array(z.object({ meter: z.string(), minutes: z.array(z.tuple([int, int, int])) })),
  outsideTruncated: z.boolean(),
});

export type Quality = z.infer<typeof Quality>;

/** Voltage of [from, to) (at most 93 days); `low`/`high`: the band, in dV. */
export async function fetchQuality(
  from: number,
  to: number,
  low: number,
  high: number,
): Promise<{ ok: true; quality: Quality } | Failure> {
  const query = new URLSearchParams({
    from: String(from),
    to: String(to),
    low: String(low),
    high: String(high),
  });
  const response = await send('GET', `/v1/quality?${query}`);
  if (response?.ok) return { ok: true, quality: Quality.parse(await response.json()) };
  return failure(response, []);
}

export async function saveQualityZone(
  zone: z.infer<typeof Zone> | null,
): Promise<{ ok: true } | Failure> {
  const response = await send('PUT', '/v1/quality/zone', { zone });
  if (response?.ok) return { ok: true };
  return failure(response, [400]);
}

const Boot = z.object({
  deviceId: z.string(),
  bootAt: int,
  startAt: int.nullable(),
  excluded: z.boolean(),
});

export type Boot = z.infer<typeof Boot>;

/** Shelly boots in [from, to) (at most 400 days): src/domain/voltage.ts turns them into outages. */
export async function fetchBoots(
  from: number,
  to: number,
): Promise<{ ok: true; boots: Boot[] } | Failure> {
  const response = await send('GET', `/v1/outages?from=${from}&to=${to}`);
  if (response?.ok) {
    return {
      ok: true,
      boots: z.object({ outages: z.array(Boot) }).parse(await response.json()).outages,
    };
  }
  return failure(response, []);
}

export async function setBootExcluded(
  deviceId: string,
  bootAt: number,
  excluded: boolean,
): Promise<{ ok: true } | Failure> {
  const response = await send('PUT', `/v1/outages/${encodeURIComponent(deviceId)}/${bootAt}`, {
    excluded,
  });
  if (response?.ok) return { ok: true };
  return failure(response, []);
}
