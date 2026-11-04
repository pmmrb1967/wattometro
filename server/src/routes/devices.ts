// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The Shelly devices: their tokens, and what they send (ingest.ts).
 *
 *   GET  /v1/devices           → {devices: DeviceView[]} (not revoked)
 *   POST /v1/devices           {name} → 201 {device: DeviceView, token} (the token is never shown again)
 *   PUT    /v1/devices/:id     {name} → 204, renamed (the token stays)
 *   DELETE /v1/devices/:id     → 204, the device's token stops working
 *   POST /v1/ingest            Authorization: Bearer <device token>; payload in ingest.ts →
 *                              {stored, duplicates, rejected, now}; 400, 401, 413, 429 (Retry-After)
 *   GET  /v1/ingest/missing?c&from&to&limit?  Authorization: Bearer <device token> →
 *                              {missing: [[start, end)…], now}: the minutes of channel c in
 *                              [from, to) (whole minutes, ≤ 11 days) not stored, the oldest
 *                              `limit` gaps at most, to fill from the Shelly's own minute log
 *                              (scripts/shelly-backfill.ts, shelly/wattometro.js 0.4.0+)
 */
import type { Hono } from 'hono';
import { z } from 'zod';
import { hashDeviceToken, newDeviceToken } from '../auth';
import { DEFAULT_REQUESTS_PER_MINUTE, ingest, MAX_INGEST_BYTES } from '../ingest';
import {
  createDevice,
  findActiveDeviceByTokenHash,
  listDevices,
  renameDevice,
  revokeDevice,
  type Device,
} from '../repo/devices';
import { missingMinutes } from '../repo/readings';
import { epoch, type AppEnv, type RouteContext } from './context';

export const MAX_DEVICE_NAME = 60;

const DeviceBody = z.object({ name: z.string().trim().min(1).max(MAX_DEVICE_NAME) });

/** The Shelly keeps "at least 10 days" of minutes (docs/shelly.md, "Registo interno"). */
export const MAX_MISSING_SPAN = 11 * 86_400;

const MissingQuery = z
  .object({
    c: z.coerce.number().int().min(0).max(3),
    from: epoch.refine((ts) => ts % 60 === 0),
    to: epoch.refine((ts) => ts % 60 === 0),
    limit: z.coerce.number().int().min(1).max(1000).optional(),
  })
  .refine(({ from, to }) => from < to && to - from <= MAX_MISSING_SPAN);

const deviceView = (device: Device) => ({
  id: device.id,
  name: device.name,
  model: device.model,
  firmware: device.firmware,
  scriptVersion: device.scriptVersion,
  createdAt: device.createdAt,
  lastSeenAt: device.lastSeenAt,
});

const BEARER = /^Bearer (\S{1,200})$/;

export function devicesRoutes(
  app: Hono<AppEnv>,
  { config, now, requireUser, body }: RouteContext,
): void {
  app.get('/v1/devices', requireUser, async (c) => {
    const devices = await listDevices(config.sql, c.get('user').householdId);
    return c.json({ devices: devices.filter((d) => d.revokedAt === null).map(deviceView) });
  });

  app.post('/v1/devices', requireUser, async (c) => {
    const parsed = await body(c, DeviceBody);
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    const token = newDeviceToken();
    const device = await createDevice(
      config.sql,
      {
        householdId: c.get('user').householdId,
        name: parsed.data.name,
        tokenHash: await hashDeviceToken(token),
      },
      now(),
    );
    return c.json({ device: deviceView(device), token }, 201);
  });

  app.put('/v1/devices/:id', requireUser, async (c) => {
    const parsed = await body(c, DeviceBody);
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    await renameDevice(config.sql, c.get('user').householdId, c.req.param('id'), parsed.data.name);
    return c.body(null, 204);
  });

  app.delete('/v1/devices/:id', requireUser, async (c) => {
    await revokeDevice(config.sql, c.get('user').householdId, c.req.param('id'), now());
    return c.body(null, 204);
  });

  app.get('/v1/ingest/missing', async (c) => {
    const token = BEARER.exec(c.req.header('Authorization') ?? '')?.[1];
    const device = token
      ? await findActiveDeviceByTokenHash(config.sql, await hashDeviceToken(token))
      : null;
    if (!device) return c.json({ error: 'unauthenticated' }, 401);
    const parsed = MissingQuery.safeParse(c.req.query());
    if (!parsed.success || parsed.data.to > now() + 120) {
      return c.json({ error: 'invalid_request' }, 400);
    }
    const { c: channel, from, to, limit } = parsed.data;
    const missing = await missingMinutes(
      config.sql,
      device.householdId,
      device.id,
      channel,
      from,
      to,
    );
    return c.json({ missing: missing.slice(0, limit), now: now() });
  });

  app.post('/v1/ingest', async (c) => {
    const token = BEARER.exec(c.req.header('Authorization') ?? '')?.[1];
    const device = token
      ? await findActiveDeviceByTokenHash(config.sql, await hashDeviceToken(token))
      : null;
    if (!device) return c.json({ error: 'unauthenticated' }, 401);
    if (Number(c.req.header('Content-Length') ?? 0) > MAX_INGEST_BYTES) {
      return c.json({ error: 'payload_too_large' }, 413);
    }
    const at = now();
    const outcome = await ingest(config.sql, device, await c.req.text(), at, {
      requestsPerMinute: config.ingestRequestsPerMinute ?? DEFAULT_REQUESTS_PER_MINUTE,
    });
    if (outcome.ok) {
      const { stored, duplicates, rejected } = outcome;
      // The server's clock: the script corrects its own when it is off (shelly/wattometro.js).
      return c.json({ stored, duplicates, rejected, now: at });
    }
    if (outcome.status === 429) {
      c.header('Retry-After', String(outcome.retryAfter));
      return c.json({ error: outcome.error, retryAfter: outcome.retryAfter }, 429);
    }
    return c.json({ error: outcome.error }, outcome.status);
  });
}
