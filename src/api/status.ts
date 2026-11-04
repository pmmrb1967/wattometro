// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Calls to the project's API, same-origin under /v1; every response is
 * validated with zod. The server's health and the last minute of each meter (the home page).
 */
import { z } from 'zod';
import { type Failure, failure, send } from './client';

const Health = z.object({
  status: z.enum(['ok', 'degraded']),
  database: z.boolean(),
  /** Past D1's daily limit: when it resets (midnight UTC). */
  limit: z.object({ resetsAt: z.number().int() }).optional(),
});

export type Health = z.infer<typeof Health>;

const Minute = z.object({
  ts: z.number().int(),
  powerAvgW: z.number().int(),
  powerMinW: z.number().int(),
  powerMaxW: z.number().int(),
  voltageAvgDv: z.number().int(),
  voltageMinDv: z.number().int(),
  voltageMaxDv: z.number().int(),
  pfAvgPct: z.number().int(),
});

const Now = z.object({
  now: z.number().int(),
  dayStart: z.number().int(),
  meters: z.array(
    z.object({
      deviceId: z.string(),
      deviceName: z.string(),
      channel: z.number().int(),
      lastSeenAt: z.number().int().nullable(),
      latest: Minute.nullable(),
      today: z.object({
        minutes: z.number().int(),
        energyWh: z.number().int(),
        powerMaxW: z.number().int().nullable(),
        quarters: z.array(z.object({ ts: z.number().int(), energyWh: z.number().int() })),
      }),
    }),
  ),
  database: z.object({
    sizeBytes: z.number().int().nullable(),
    limitBytes: z.number().int(),
    // Absent from a server older than the app.
    rowsReadToday: z.number().int().default(0),
    rowsReadLimit: z.number().int().default(5_000_000),
  }),
});

export type Now = z.infer<typeof Now>;

export type Meter = Now['meters'][number];

export async function fetchHealth(signal?: AbortSignal): Promise<Health> {
  const response = await fetch('/v1/health', { signal });
  return Health.parse(await response.json());
}

/** The latest minute and today so far, per meter (GET /v1/now). */
export async function fetchNow(): Promise<{ ok: true; now: Now } | Failure> {
  const response = await send('GET', '/v1/now');
  if (response?.ok) return { ok: true, now: Now.parse(await response.json()) };
  return failure(response, []);
}
