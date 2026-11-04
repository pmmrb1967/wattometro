// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Calls to the project's API, same-origin under /v1; every response is
 * validated with zod. Contracted power: peaks and the per-second values.
 */
import { z } from 'zod';
import { type Failure, failure, int, send } from './client';

const QuarterPeak = z.object({ ts: int, peak: int, estimated: z.boolean() });

const Power = z.object({
  devices: z.array(z.object({ id: z.string(), name: z.string() })),
  meters: z.array(
    z.object({
      meter: z.string(),
      minutes: int,
      apparentMinutes: int,
      apparentMaxVa: int.nullable(),
      activeMaxW: int.nullable(),
      activeOnlyMaxW: int.nullable(),
      top: z.array(QuarterPeak),
    }),
  ),
  /** Highest one-second power of each meter and day (server/src/repo/power.ts). */
  days: z.array(
    z.object({
      meter: z.string(),
      day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      peak: int,
      estimated: z.boolean(),
    }),
  ),
  eredes: z.object({ quarters: int, maxEnergyWh: int.nullable() }),
});

export type Power = z.infer<typeof Power>;

/** Peaks per meter in [from, to) (at most 366 days). */
export async function fetchPower(
  from: number,
  to: number,
): Promise<{ ok: true; power: Power } | Failure> {
  const response = await send('GET', `/v1/power?from=${from}&to=${to}`);
  if (response?.ok) return { ok: true, power: Power.parse(await response.json()) };
  return failure(response, []);
}

/** Minutes of a meter above `threshold`, as records for decodePeaks (src/domain/contracted-power.ts). */
export async function fetchPeakRecords(
  meter: string,
  from: number,
  to: number,
  threshold: number,
): Promise<{ ok: true; records: ArrayBuffer; truncated: boolean } | Failure> {
  const query = new URLSearchParams({
    meter,
    from: String(from),
    to: String(to),
    threshold: String(threshold),
  });
  const response = await send('GET', `/v1/power/peaks?${query}`);
  if (response?.ok) {
    return {
      ok: true,
      records: await response.arrayBuffer(),
      truncated: response.headers.get('X-Truncated') === '1',
    };
  }
  return failure(response, []);
}

/** GET /v1/seconds: a meter's per-second values in [from, to) (≤ 25 h), as records. */
export async function fetchSeconds(
  meter: string,
  from: number,
  to: number,
): Promise<{ ok: true; records: ArrayBuffer } | Failure> {
  const query = new URLSearchParams({ meter, from: String(from), to: String(to) });
  const response = await send('GET', `/v1/seconds?${query}`);
  if (response?.ok) return { ok: true, records: await response.arrayBuffer() };
  return failure(response, []);
}
