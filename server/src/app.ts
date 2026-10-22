// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * API routes (Hono). The Worker stays thin: validate, call repo/, answer.
 * Routes never write SQL (CLAUDE.md, rule 5); the API is versioned (/v1).
 * It is same-origin with the app (gateway.ts), so there is no CORS.
 *
 *   GET  /v1/health            → {status: 'ok' | 'degraded', database: boolean}
 *   POST /v1/auth/login        {email, password} → Me + session cookie;
 *                              401 invalid_credentials, 429 locked (Retry-After)
 *   POST /v1/auth/logout       → 204, clears the cookie
 *   GET  /v1/auth/me           → Me, or 401 unauthenticated
 *   POST /v1/account/password  {currentPassword, newPassword} → 204 + new cookie;
 *                              403 wrong_password, 429 locked; other devices are signed out
 *   PUT  /v1/household         {name} → Me
 *   GET  /v1/devices           → {devices: DeviceView[]} (not revoked)
 *   POST /v1/devices           {name} → 201 {device: DeviceView, token} (the token is never shown again)
 *   DELETE /v1/devices/:id     → 204, the device's token stops working
 *   GET  /v1/now               → {now, dayStart, meters: [{deviceId, deviceName, channel, lastSeenAt,
 *                              latest: minute | null, today: {minutes, energyWh, powerMaxW,
 *                              quarters: [{ts, energyWh}]}}], database: {sizeBytes, limitBytes}}
 *                              (today = since Lisbon midnight)
 *   GET  /v1/tariffs           → {tariffs: Tariff[]} (oldest first; src/domain/tariff.ts)
 *   POST /v1/tariffs           TariffInput → 201 {tariff}; same validFrom replaces that contract
 *   DELETE /v1/tariffs/:id     → 204
 *   POST /v1/ingest            Authorization: Bearer <device token>; payload in ingest.ts →
 *                              {stored, duplicates, rejected}; 400, 401, 413, 429 (Retry-After)
 *
 * Me = {email, householdId, householdName}. Every signed-in request renews an
 * older session cookie (sliding expiry, auth.ts). /v1/ingest is for devices:
 * no cookie, no Origin.
 */
import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import { z } from 'zod';
import {
  changePassword,
  hashDeviceToken,
  login,
  newDeviceToken,
  readSession,
  SESSION_COOKIE,
  SESSION_SECONDS,
  signSession,
} from './auth';
import type { Sql } from './db';
import { lisbonDate, startOfLisbonDay } from '../../src/lib/time';
import { DEFAULT_REQUESTS_PER_MINUTE, ingest, MAX_INGEST_BYTES } from './ingest';
import { MIN_PASSWORD_LENGTH } from './password';
import {
  createDevice,
  findActiveDeviceByTokenHash,
  listDevices,
  revokeDevice,
  type Device,
} from './repo/devices';
import { databaseReachable } from './repo/health';
import { tariffInputSchema } from '../../src/domain/tariff';
import { latestMinute, todayByMeter, todayQuarters } from './repo/now';
import { deleteTariff, listTariffs, saveTariff } from './repo/tariffs';
import { getState } from './repo/rollups';
import { STATE } from './rollups';
import { getHousehold, renameHousehold } from './repo/households';
import type { User } from './repo/users';

export interface AppConfig {
  sql: Sql;
  /** Secret that signs session cookies (wrangler secret put SESSION_SECRET). */
  sessionSecret: string;
  /** Origins besides the API's own that may send writes (local development). */
  allowedOrigins: string[];
  /** Current time in epoch seconds (tests set it). */
  now?: () => number;
  /** Ingest requests a device may send per minute (catching up sends several). */
  ingestRequestsPerMinute?: number;
  /** Size limit of the D1 database (500 MB on the free plan). */
  databaseLimitBytes?: number;
}

export const DEFAULT_DATABASE_LIMIT_BYTES = 500 * 1000 * 1000;

type AppEnv = { Variables: { user: User } };

const LoginBody = z.object({
  email: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(1024),
});

const PasswordBody = z.object({
  currentPassword: z.string().min(1).max(1024),
  newPassword: z.string().min(MIN_PASSWORD_LENGTH).max(1024),
});

export const MAX_HOUSEHOLD_NAME = 60;
const HouseholdBody = z.object({ name: z.string().trim().min(1).max(MAX_HOUSEHOLD_NAME) });

export const MAX_DEVICE_NAME = 60;
const DeviceBody = z.object({ name: z.string().trim().min(1).max(MAX_DEVICE_NAME) });

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

const COOKIE_OPTIONS = {
  path: '/',
  httpOnly: true,
  secure: true,
  sameSite: 'Strict',
  prefix: 'host',
} as const;

export function createApp(config: AppConfig): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  const now = config.now ?? (() => Math.floor(Date.now() / 1000));

  /** Writes must come from the app itself: with SameSite=Strict, a second guard against CSRF. */
  const trustedOrigin = (c: Context) => {
    const origin = c.req.header('Origin');
    return (
      origin !== undefined &&
      (origin === new URL(c.req.url).origin || config.allowedOrigins.includes(origin))
    );
  };

  const startSession = async (c: Context, user: User) => {
    const token = await signSession(user, config.sessionSecret, now());
    setCookie(c, SESSION_COOKIE, token, { ...COOKIE_OPTIONS, maxAge: SESSION_SECONDS });
  };

  const me = async (user: User) => ({
    email: user.email,
    householdId: user.householdId,
    householdName: (await getHousehold(config.sql, user.householdId))?.name ?? '',
  });

  const body = async <T>(c: Context, schema: z.ZodType<T>) =>
    schema.safeParse(await c.req.json().catch(() => null));

  const requireUser = createMiddleware<AppEnv>(async (c, next) => {
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD' && !trustedOrigin(c)) {
      return c.json({ error: 'forbidden_origin' }, 403);
    }
    const token = getCookie(c, SESSION_COOKIE, 'host');
    const session = token
      ? await readSession(config.sql, token, config.sessionSecret, now())
      : null;
    if (!session) return c.json({ error: 'unauthenticated' }, 401);
    if (session.renew) await startSession(c, session.user);
    c.set('user', session.user);
    await next();
  });

  app.use('/v1/*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store');
  });

  app.get('/v1/health', async (c) => {
    const database = await databaseReachable(config.sql);
    return c.json({ status: database ? 'ok' : 'degraded', database }, database ? 200 : 503);
  });

  app.post('/v1/auth/login', async (c) => {
    if (!trustedOrigin(c)) return c.json({ error: 'forbidden_origin' }, 403);
    const parsed = await body(c, LoginBody);
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);

    const result = await login(config.sql, parsed.data.email, parsed.data.password, now());
    if (!result.ok) {
      if (result.reason === 'locked') {
        c.header('Retry-After', String(result.retryAfter));
        return c.json({ error: 'locked', retryAfter: result.retryAfter }, 429);
      }
      return c.json({ error: 'invalid_credentials' }, 401);
    }
    await startSession(c, result.user);
    return c.json(await me(result.user));
  });

  app.post('/v1/auth/logout', (c) => {
    if (!trustedOrigin(c)) return c.json({ error: 'forbidden_origin' }, 403);
    deleteCookie(c, SESSION_COOKIE, COOKIE_OPTIONS);
    return c.body(null, 204);
  });

  app.get('/v1/auth/me', requireUser, async (c) => c.json(await me(c.get('user'))));

  app.post('/v1/account/password', requireUser, async (c) => {
    const parsed = await body(c, PasswordBody);
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    const result = await changePassword(
      config.sql,
      c.get('user'),
      parsed.data.currentPassword,
      parsed.data.newPassword,
      now(),
    );
    if (!result.ok) {
      if (result.reason === 'locked') {
        c.header('Retry-After', String(result.retryAfter));
        return c.json({ error: 'locked', retryAfter: result.retryAfter }, 429);
      }
      return c.json({ error: 'wrong_password' }, 403);
    }
    // This device stays signed in with the new session version.
    await startSession(c, result.user);
    return c.body(null, 204);
  });

  app.put('/v1/household', requireUser, async (c) => {
    const parsed = await body(c, HouseholdBody);
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    const user = c.get('user');
    await renameHousehold(config.sql, user.householdId, parsed.data.name);
    return c.json(await me(user));
  });

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

  app.delete('/v1/devices/:id', requireUser, async (c) => {
    await revokeDevice(config.sql, c.get('user').householdId, c.req.param('id'), now());
    return c.body(null, 204);
  });

  app.get('/v1/now', requireUser, async (c) => {
    const { householdId } = c.get('user');
    const at = now();
    const dayStart = startOfLisbonDay(lisbonDate(at));
    const devices = (await listDevices(config.sql, householdId)).filter(
      (d) => d.revokedAt === null,
    );
    const today = await todayByMeter(config.sql, householdId, dayStart);
    const quarters = await todayQuarters(config.sql, householdId, dayStart);
    const meters = [];
    for (const device of devices) {
      const measured = today.filter((meter) => meter.deviceId === device.id);
      // A device without data today still shows, on its main channel.
      const channels = measured.length > 0 ? measured.map((meter) => meter.channel) : [0];
      for (const channel of channels) {
        const sums = measured.find((meter) => meter.channel === channel);
        meters.push({
          deviceId: device.id,
          deviceName: device.name,
          channel,
          lastSeenAt: device.lastSeenAt,
          latest: await latestMinute(config.sql, householdId, device.id, channel),
          today: {
            minutes: sums?.minutes ?? 0,
            energyWh: sums?.energyWh ?? 0,
            powerMaxW: sums?.powerMaxW ?? null,
            quarters: quarters
              .filter((q) => q.deviceId === device.id && q.channel === channel)
              .map((q) => ({ ts: q.ts, energyWh: q.energyWh })),
          },
        });
      }
    }
    return c.json({
      now: at,
      dayStart,
      meters,
      database: {
        sizeBytes: await getState(config.sql, STATE.databaseBytes),
        limitBytes: config.databaseLimitBytes ?? DEFAULT_DATABASE_LIMIT_BYTES,
      },
    });
  });

  app.get('/v1/tariffs', requireUser, async (c) =>
    c.json({ tariffs: await listTariffs(config.sql, c.get('user').householdId) }),
  );

  app.post('/v1/tariffs', requireUser, async (c) => {
    const parsed = await body(c, tariffInputSchema);
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    const tariff = await saveTariff(config.sql, c.get('user').householdId, parsed.data, now());
    return c.json({ tariff }, 201);
  });

  app.delete('/v1/tariffs/:id', requireUser, async (c) => {
    await deleteTariff(config.sql, c.get('user').householdId, c.req.param('id'));
    return c.body(null, 204);
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
    const outcome = await ingest(config.sql, device, await c.req.text(), now(), {
      requestsPerMinute: config.ingestRequestsPerMinute ?? DEFAULT_REQUESTS_PER_MINUTE,
    });
    if (outcome.ok) {
      const { stored, duplicates, rejected } = outcome;
      return c.json({ stored, duplicates, rejected });
    }
    if (outcome.status === 429) {
      c.header('Retry-After', String(outcome.retryAfter));
      return c.json({ error: outcome.error, retryAfter: outcome.retryAfter }, 429);
    }
    return c.json({ error: outcome.error }, outcome.status);
  });

  app.notFound((c) => c.json({ error: 'not_found' }, 404));
  app.onError((_error, c) => c.json({ error: 'internal' }, 500));

  return app;
}
