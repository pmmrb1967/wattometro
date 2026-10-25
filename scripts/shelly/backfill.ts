// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The Shelly's own minute log (EM1Data.GetData, docs/shelly.md "Registo
 * interno") turned into /v1/ingest minutes (format 1, server/src/ingest.ts),
 * for the minutes the server missed. The log has no per-second values: the
 * minutes go without p/q/u, with the apparent peak in `sx`.
 *
 *   e   the log's Wh (with decimals), carried from minute to minute so the
 *       whole Wh add up as the counter did (as the script does)
 *   pa  e × 60 (the mean power of the minute), within [pn, px]
 *   pf  P / (V × I) with the mean voltage and current: close to ΣP/ΣS for a
 *       steady load; 100 without current, as the script sends
 */
import { z } from 'zod';

export const LOG_KEYS = [
  'total_act_energy',
  'max_act_power',
  'min_act_power',
  'max_aprt_power',
  'max_voltage',
  'min_voltage',
  'avg_voltage',
  'avg_current',
] as const;

export const LogData = z.object({
  keys: z.array(z.string()),
  data: z.array(
    z.object({
      ts: z.number().int(),
      period: z.number().int(),
      values: z.array(z.array(z.number().nullable())),
    }),
  ),
  next_record_ts: z.number().int().optional(),
});
export type LogData = z.infer<typeof LogData>;

export interface LogMinute {
  t: number;
  values: Record<(typeof LOG_KEYS)[number], number>;
}

export interface IngestMinute {
  t: number;
  c: number;
  n: number;
  e: number;
  pa: number;
  pn: number;
  px: number;
  va: number;
  vn: number;
  vx: number;
  pf: number;
  sx: number;
}

const INT16 = 32_767;
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** The one-minute records of a GetData answer in [from, to); records with a gap in their values are left out. */
export function logMinutes(answer: LogData, from: number, to: number): LogMinute[] {
  const index = LOG_KEYS.map((key) => answer.keys.indexOf(key));
  if (index.some((i) => i < 0)) throw new Error(`EM1Data keys missing: ${answer.keys.join(',')}`);
  const minutes: LogMinute[] = [];
  for (const block of answer.data) {
    if (block.period !== 60) continue;
    block.values.forEach((row, offset) => {
      const t = block.ts + offset * 60;
      if (t < from || t >= to || t % 60 !== 0) return;
      const picked = index.map((i) => row[i]);
      if (picked.some((value) => typeof value !== 'number' || !Number.isFinite(value))) return;
      minutes.push({
        t,
        values: Object.fromEntries(
          LOG_KEYS.map((key, k) => [key, picked[k] as number]),
        ) as LogMinute['values'],
      });
    });
  }
  return minutes.sort((a, b) => a.t - b.t);
}

/** Ingest minutes of one channel; the Wh carry over only between consecutive minutes. */
export function toIngestMinutes(minutes: readonly LogMinute[], channel: number): IngestMinute[] {
  let carried = 0;
  let previous: number | null = null;
  return minutes.map(({ t, values }) => {
    if (previous === null || t !== previous + 60) carried = 0;
    previous = t;
    const before = Math.floor(carried);
    carried += Math.max(0, values.total_act_energy);
    const e = Math.min(1000, Math.floor(carried) - before);
    const mean = clamp(Math.round(values.total_act_energy * 60), -INT16, INT16);
    const pn = Math.min(clamp(Math.round(values.min_act_power), -INT16, INT16), mean);
    const px = Math.max(clamp(Math.round(values.max_act_power), -INT16, INT16), mean);
    const vn = Math.round(values.min_voltage * 10);
    const vx = Math.max(vn, Math.round(values.max_voltage * 10));
    const va = clamp(Math.round(values.avg_voltage * 10), vn, vx);
    const apparent = values.avg_voltage * values.avg_current;
    const pf =
      apparent > 0
        ? clamp(Math.round((100 * values.total_act_energy * 60) / apparent), -100, 100)
        : 100;
    return {
      t,
      c: channel,
      n: 60,
      e,
      pa: mean,
      pn,
      px,
      va: clamp(va, 0, INT16),
      vn: clamp(vn, 0, INT16),
      vx: clamp(vx, 0, INT16),
      pf,
      sx: clamp(Math.round(values.max_aprt_power), 0, INT16),
    };
  });
}
