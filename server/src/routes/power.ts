// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Contracted power: peaks by meter and day, and the per-second values.
 *
 *   GET  /v1/power?from&to     → {devices: [{id, name}], meters: [MeterPower & {top: QuarterPeak[]}],
 *                              days: DayPeak[], eredes: {quarters, maxEnergyWh}} (repo/power.ts;
 *                              ≤ 366 days)
 *   GET  /v1/power/peaks?meter&from&to&threshold → application/octet-stream, the minutes of
 *                              meter 'device:channel' above threshold (VA, else W) as records
 *                              (repo/power.ts; ≤ 366 days); X-Truncated: 1 when there were more
 *   GET  /v1/seconds?meter&from&to → application/octet-stream, the per-second values of meter
 *                              'device:channel' in [from, to) (≤ 25 h) as records (repo/seconds.ts)
 */
import type { Hono } from 'hono';
import { z } from 'zod';
import { listDevices } from '../repo/devices';
import { secondsRecords } from '../repo/seconds';
import { getState } from '../repo/rollups';
import { STATE } from '../rollups';
import {
  dayPeaks,
  eredesQuarters,
  peakMinutes,
  powerByMeter,
  splitRange,
  topQuarters,
} from '../repo/power';
import { epoch, rangeQuery, type AppEnv, type RouteContext } from './context';

/** "Potência" looks back a year: per-second values for 90 days, minute peaks before. */
export const MAX_POWER_DAYS = 366;

export const TOP_QUARTERS = 10;

export const MAX_PEAK_MINUTES = 1440;

const PeaksQuery = rangeQuery(MAX_POWER_DAYS).and(
  z.object({
    meter: z.string().regex(/^[^:]{1,64}:[0-3]$/),
    threshold: z.coerce.number().int().min(0).max(1_000_000),
  }),
);

/** A Lisbon day of 25 hours. */
export const MAX_SECONDS_SPAN = 25 * 3600;

const SecondsQuery = z
  .object({ meter: z.string().regex(/^[^:]{1,64}:[0-3]$/), from: epoch, to: epoch })
  .refine(({ from, to }) => from < to && to - from <= MAX_SECONDS_SPAN);

export function powerRoutes(app: Hono<AppEnv>, { config, requireUser }: RouteContext): void {
  app.get('/v1/power', requireUser, async (c) => {
    const parsed = rangeQuery(MAX_POWER_DAYS).safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    const { from, to } = parsed.data;
    const { householdId } = c.get('user');
    const range = splitRange(
      from,
      to,
      await getState(config.sql, STATE.rolledUpUntil(householdId)),
    );
    const meters = [];
    for (const meter of await powerByMeter(config.sql, householdId, range)) {
      const [deviceId = '', channel] = meter.meter.split(':');
      const top = await topQuarters(
        config.sql,
        householdId,
        deviceId,
        Number(channel),
        range,
        TOP_QUARTERS,
      );
      meters.push({ ...meter, top });
    }
    return c.json({
      devices: (await listDevices(config.sql, householdId)).map((d) => ({
        id: d.id,
        name: d.name,
      })),
      meters,
      days: await dayPeaks(config.sql, householdId, range),
      // Only used without a Shelly ("Potência" from the E-Redes file): not read otherwise.
      eredes:
        meters.length > 0
          ? { quarters: 0, maxEnergyWh: null }
          : await eredesQuarters(config.sql, householdId, from, to),
    });
  });

  app.get('/v1/power/peaks', requireUser, async (c) => {
    const parsed = PeaksQuery.safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    const { meter, from, to, threshold } = parsed.data;
    const [deviceId = '', channel] = meter.split(':');
    const { householdId } = c.get('user');
    const range = splitRange(
      from,
      to,
      await getState(config.sql, STATE.rolledUpUntil(householdId)),
    );
    const peaks = await peakMinutes(
      config.sql,
      householdId,
      deviceId,
      Number(channel),
      range,
      threshold,
      MAX_PEAK_MINUTES,
    );
    c.header('Content-Type', 'application/octet-stream');
    c.header('X-Truncated', peaks.truncated ? '1' : '0');
    return c.body(peaks.records.buffer as ArrayBuffer);
  });

  app.get('/v1/seconds', requireUser, async (c) => {
    const parsed = SecondsQuery.safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    const { meter, from, to } = parsed.data;
    const [deviceId = '', channel] = meter.split(':');
    const records = await secondsRecords(
      config.sql,
      c.get('user').householdId,
      deviceId,
      Number(channel),
      from,
      to,
    );
    c.header('Content-Type', 'application/octet-stream');
    return c.body(records.buffer as ArrayBuffer);
  });
}
