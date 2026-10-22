// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * POST /v1/ingest: minutes sent by shelly/wattometro.js. The payload format is
 * versioned (`v`) so installed scripts keep working as the server evolves
 * (CLAUDE.md, rule 8). Every minute is validated on its own: a bad one is
 * counted as rejected and the rest are stored. A resent minute is a duplicate,
 * never a second row, so the script can always resend after a failure.
 *
 * Payload, format 1 (short keys: the Shelly sends at most 8192 bytes per request):
 *   {v: 1, sv: script version, m?: model, fw?: firmware, min: [Minute, …]}
 *   Minute = {t: start (epoch s, multiple of 60), c: channel, n: seconds with a reading,
 *             e: Wh, pa/pn/px: W avg/min/max, va/vn/vx: dV avg/min/max, pf: ΣP/ΣS %,
 *             p?, q?, u?: 60 × (int | null), active W, non-active var, dV}
 */
import { z } from 'zod';
import { encodeSeconds, MAX_INT16, SECONDS_PER_MINUTE } from '../../src/lib/readings-1s';
import type { Sql } from './db';
import { deviceSeenStatement, type IngestDevice } from './repo/devices';
import { minuteStatements, type MinuteReading } from './repo/readings';

export const INGEST_FORMAT = 1;
export const MAX_INGEST_BYTES = 16_384;
export const MAX_MINUTES_PER_REQUEST = 20;
export const DEFAULT_REQUESTS_PER_MINUTE = 20;
/** The Shelly's clock may run slightly ahead. */
export const FUTURE_TOLERANCE_SECONDS = 120;
/** The script's queue lives in RAM: older minutes are not expected. */
export const MAX_AGE_SECONDS = 30 * 24 * 3600;
/** 16 kW for a minute is 267 Wh; anything far above is a broken counter. */
export const MAX_MINUTE_WH = 1000;
export const MAX_CHANNEL = 3;

const int16 = z.number().int().min(-MAX_INT16).max(MAX_INT16);
const decivolts = z.number().int().min(0).max(MAX_INT16);
const series = z.array(int16.nullable()).length(SECONDS_PER_MINUTE);

const Minute = z
  .object({
    t: z
      .number()
      .int()
      .min(0)
      .refine((t) => t % 60 === 0),
    c: z.number().int().min(0).max(MAX_CHANNEL),
    n: z.number().int().min(1).max(SECONDS_PER_MINUTE),
    e: z.number().int().min(0).max(MAX_MINUTE_WH),
    pa: int16,
    pn: int16,
    px: int16,
    va: decivolts,
    vn: decivolts,
    vx: decivolts,
    pf: z.number().int().min(-100).max(100),
    p: series.optional(),
    q: series.optional(),
    u: series.optional(),
  })
  .refine((m) => m.pn <= m.pa && m.pa <= m.px && m.vn <= m.va && m.va <= m.vx)
  .refine(
    (m) =>
      (m.p === undefined) === (m.q === undefined) && (m.q === undefined) === (m.u === undefined),
  );

const Envelope = z.object({
  v: z.literal(INGEST_FORMAT),
  sv: z.string().min(1).max(20),
  m: z.string().min(1).max(40).optional(),
  fw: z.string().min(1).max(80).optional(),
  min: z.array(z.unknown()).min(1).max(MAX_MINUTES_PER_REQUEST),
});

export interface IngestLimits {
  requestsPerMinute: number;
}

export type IngestOutcome =
  | { ok: true; stored: number; duplicates: number; rejected: number }
  | { ok: false; status: 400 | 413; error: 'invalid_payload' | 'payload_too_large' }
  | { ok: false; status: 429; error: 'rate_limited'; retryAfter: number };

function toReading(minute: z.infer<typeof Minute>): MinuteReading {
  return {
    ts: minute.t,
    channel: minute.c,
    samples: minute.n,
    energyWh: minute.e,
    powerAvgW: minute.pa,
    powerMinW: minute.pn,
    powerMaxW: minute.px,
    voltageMinDv: minute.vn,
    voltageAvgDv: minute.va,
    voltageMaxDv: minute.vx,
    pfAvgPct: minute.pf,
    seconds:
      minute.p && minute.q && minute.u
        ? encodeSeconds({ power: minute.p, nonActive: minute.q, voltage: minute.u })
        : null,
  };
}

export async function ingest(
  sql: Sql,
  device: IngestDevice,
  body: string,
  now: number,
  limits: IngestLimits,
): Promise<IngestOutcome> {
  const window = now - (now % 60);
  const count = device.rateWindow === window ? device.rateCount + 1 : 1;
  if (count > limits.requestsPerMinute) {
    return { ok: false, status: 429, error: 'rate_limited', retryAfter: window + 60 - now };
  }
  if (new TextEncoder().encode(body).byteLength > MAX_INGEST_BYTES) {
    return { ok: false, status: 413, error: 'payload_too_large' };
  }

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return { ok: false, status: 400, error: 'invalid_payload' };
  }
  const envelope = Envelope.safeParse(json);
  if (!envelope.success) return { ok: false, status: 400, error: 'invalid_payload' };

  const readings: MinuteReading[] = [];
  for (const item of envelope.data.min) {
    const minute = Minute.safeParse(item);
    if (
      minute.success &&
      minute.data.t <= now + FUTURE_TOLERANCE_SECONDS &&
      minute.data.t >= now - MAX_AGE_SECONDS
    ) {
      readings.push(toReading(minute.data));
    }
  }

  // Remember where each minute's readings_1m insert lands in the batch.
  const statements = [];
  const minuteIndexes: number[] = [];
  for (const reading of readings) {
    minuteIndexes.push(statements.length);
    statements.push(...minuteStatements(device, reading));
  }
  statements.push(
    deviceSeenStatement(device.id, {
      now,
      model: envelope.data.m ?? null,
      firmware: envelope.data.fw ?? null,
      scriptVersion: envelope.data.sv,
      rateWindow: window,
      rateCount: count,
    }),
  );
  const changes = await sql.batch(statements);
  const stored = minuteIndexes.filter((index) => changes[index] === 1).length;

  return {
    ok: true,
    stored,
    duplicates: readings.length - stored,
    rejected: envelope.data.min.length - readings.length,
  };
}
