// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Voltage quality and outages (docs/voltage.md).
 *
 *   GET  /v1/quality?from&to&low&high → {zone, devices: [{id, name}], intervals: [{meter,
 *                              intervals: [ts, minutes, avgDv, minDv, maxDv][]}], outside: [{meter,
 *                              minutes: [ts, minDv, maxDv][]}], outsideTruncated} (docs/voltage.md;
 *                              [from, to) at most 93 days; outside = minutes beyond [low, high] dV)
 *   PUT  /v1/quality/zone      {zone: 'A' | 'B' | 'C' | null} → 204
 *   GET  /v1/outages?from&to   → {outages: [{deviceId, bootAt, startAt, excluded}]} (≤ 400 days)
 *   PUT  /v1/outages/:deviceId/:bootAt {excluded} → 204
 */
import type { Hono } from 'hono';
import { z } from 'zod';
import { listDevices } from '../repo/devices';
import {
  getQualityZone,
  listOutages,
  listVoltage10m,
  minutesOutside,
  QUALITY_ZONES,
  setOutageExcluded,
  setQualityZone,
} from '../repo/quality';
import { epoch, rangeQuery, type AppEnv, type RouteContext } from './context';

export const MAX_QUALITY_DAYS = 93;

export const MAX_OUTAGE_DAYS = 400;

export const MAX_MINUTES_OUTSIDE = 5000;

const decivolts = z.coerce.number().int().min(0).max(10_000);

const QualityQuery = rangeQuery(MAX_QUALITY_DAYS).and(
  z.object({ low: decivolts, high: decivolts }),
);

const ZoneBody = z.object({ zone: z.enum(QUALITY_ZONES).nullable() });

const ExcludedBody = z.object({ excluded: z.boolean() });

export function qualityRoutes(
  app: Hono<AppEnv>,
  { config, requireUser, body }: RouteContext,
): void {
  app.get('/v1/quality', requireUser, async (c) => {
    const parsed = QualityQuery.safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    const { from, to, low, high } = parsed.data;
    const { householdId } = c.get('user');
    // One more than the limit, to know whether the list was cut.
    const outside = await minutesOutside(
      config.sql,
      householdId,
      from,
      to,
      low,
      high,
      MAX_MINUTES_OUTSIDE + 1,
    );
    const found = outside.reduce((sum, meter) => sum + meter.minutes.length, 0);
    let room = MAX_MINUTES_OUTSIDE;
    const kept = outside
      .map(({ meter, minutes }) => {
        const slice = minutes.slice(0, room);
        room -= slice.length;
        return { meter, minutes: slice };
      })
      .filter((meter) => meter.minutes.length > 0);
    return c.json({
      zone: await getQualityZone(config.sql, householdId),
      devices: (await listDevices(config.sql, householdId)).map((d) => ({
        id: d.id,
        name: d.name,
      })),
      intervals: await listVoltage10m(config.sql, householdId, from, to),
      outside: kept,
      outsideTruncated: found > MAX_MINUTES_OUTSIDE,
    });
  });

  app.put('/v1/quality/zone', requireUser, async (c) => {
    const parsed = await body(c, ZoneBody);
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    await setQualityZone(config.sql, c.get('user').householdId, parsed.data.zone);
    return c.body(null, 204);
  });

  app.get('/v1/outages', requireUser, async (c) => {
    const parsed = rangeQuery(MAX_OUTAGE_DAYS).safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    const { from, to } = parsed.data;
    return c.json({ outages: await listOutages(config.sql, c.get('user').householdId, from, to) });
  });

  app.put('/v1/outages/:deviceId/:bootAt', requireUser, async (c) => {
    const parsed = await body(c, ExcludedBody);
    const bootAt = epoch.safeParse(c.req.param('bootAt'));
    if (!parsed.success || !bootAt.success) return c.json({ error: 'invalid_request' }, 400);
    await setOutageExcluded(
      config.sql,
      c.get('user').householdId,
      c.req.param('deviceId'),
      bootAt.data,
      parsed.data.excluded,
    );
    return c.body(null, 204);
  });
}
