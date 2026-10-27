// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * API routes (Hono). The Worker stays thin: validate, call repo/, answer.
 * Routes never write SQL (CLAUDE.md, rule 5); the API is versioned (/v1).
 * It is same-origin with the app (gateway.ts), so there is no CORS.
 *
 *   GET  /v1/health            → {status: 'ok' | 'degraded', database: boolean}; past D1's
 *                              daily limit also limit: {resetsAt} (503)
 *   POST /v1/auth/login        {email, password} → Me + session cookie;
 *                              401 invalid_credentials, 429 locked (Retry-After)
 *   POST /v1/auth/logout       → 204, clears the cookie
 *   GET  /v1/auth/me           → Me, or 401 unauthenticated
 *   POST /v1/account/password  {currentPassword, newPassword} → 204 + new cookie;
 *                              403 wrong_password, 429 locked; other devices are signed out
 *   GET  /v1/ai-settings       → {apiKey, model, autoSend, updatedAt}; 404 none; 503 without
 *                              AI_KEY_SECRET (the key is sealed in D1: secret-box.ts)
 *   PUT  /v1/ai-settings       {apiKey, model, autoSend} → 204
 *   DELETE /v1/ai-settings     → 204 (on every device)
 *   GET  /v1/push/key          → {publicKey} (VAPID, for the browser's subscription); 503 none
 *   GET  /v1/push/subscription?endpoint → {alerts: {stale, power, database, cheapHours}}; 404 not this user's
 *   PUT  /v1/push/subscription {endpoint, keys: {p256dh, auth}, alerts} → 204 (a push service's
 *                              endpoint only: webpush.ts, isPushEndpoint)
 *   DELETE /v1/push/subscription {endpoint} → 204
 *   POST /v1/push/test         {endpoint} → 204 sent; 404; 502 the push service refused
 *   PUT  /v1/household         {name} → Me
 *   GET  /v1/household/location → {location: {name, latitudeCdeg, longitudeCdeg} | null}
 *   PUT  /v1/household/location {location: … | null} → 204 (the locality, for the weather;
 *                              hundredths of a degree, docs/open-meteo.md)
 *   GET  /v1/household/installation → {installation: Installation} (src/domain/installation.ts;
 *                              every answer null until saved)
 *   PUT  /v1/household/installation {installation} → 204
 *   GET  /v1/devices           → {devices: DeviceView[]} (not revoked)
 *   POST /v1/devices           {name} → 201 {device: DeviceView, token} (the token is never shown again)
 *   DELETE /v1/devices/:id     → 204, the device's token stops working
 *   GET  /v1/now               → {now, dayStart, meters: [{deviceId, deviceName, channel, lastSeenAt,
 *                              latest: minute | null, today: {minutes, energyWh, powerMaxW,
 *                              quarters: [{ts, energyWh}]}}], database: {sizeBytes, limitBytes,
 *                              rowsReadToday, rowsReadLimit}}
 *                              (today = since Lisbon midnight)
 *   GET  /v1/tariffs           → {tariffs: Tariff[]} (oldest first; src/domain/tariff.ts)
 *   POST /v1/tariffs           TariffInput → 201 {tariff}; same validFrom replaces that contract
 *   DELETE /v1/tariffs/:id     → 204
 *   GET  /v1/quality?from&to&low&high → {zone, devices: [{id, name}], intervals: [{meter,
 *                              intervals: [ts, minutes, avgDv, minDv, maxDv][]}], outside: [{meter,
 *                              minutes: [ts, minDv, maxDv][]}], outsideTruncated} (docs/voltage.md;
 *                              [from, to) at most 93 days; outside = minutes beyond [low, high] dV)
 *   PUT  /v1/quality/zone      {zone: 'A' | 'B' | 'C' | null} → 204
 *   GET  /v1/outages?from&to   → {outages: [{deviceId, bootAt, startAt, excluded}]} (≤ 400 days)
 *   PUT  /v1/outages/:deviceId/:bootAt {excluded} → 204
 *   GET  /v1/power?from&to     → {devices: [{id, name}], meters: [MeterPower & {top: QuarterPeak[]}],
 *                              eredes: {quarters, maxEnergyWh}} (repo/power.ts; ≤ 93 days)
 *   GET  /v1/power/peaks?meter&from&to&threshold → application/octet-stream, the minutes of
 *                              meter 'device:channel' above threshold (VA, else W) as records
 *                              (repo/power.ts); X-Truncated: 1 when there were more
 *   GET  /v1/seconds?meter&from&to → application/octet-stream, the per-second values of meter
 *                              'device:channel' in [from, to) (≤ 25 h) as records (repo/seconds.ts)
 *   POST /v1/signatures        {meter, label, from, to} → 201 {signature}: the per-second values
 *                              of [from, to) (≤ 4 h, a minute beyond each side) copied to stay
 *                              (repo/signatures.ts); 404 unknown meter, 409 no_seconds yet
 *   GET  /v1/signatures        → {signatures: [{id, meter, label, from, to, minutes, createdAt}]}
 *   GET  /v1/signatures/:id/seconds → application/octet-stream, its minutes as records
 *   DELETE /v1/signatures/:id  → 204
 *   GET  /v1/appliances        → {appliances: [{id, label, powerW, statesW, pulsing,
 *                              minDurationS, maxDurationS, heats, createdAt}]}
 *   POST /v1/appliances        {label, powerW, statesW, pulsing, minDurationS?, maxDurationS?,
 *                              heats?}
 *                              → 201 {appliance}; 409 too_many
 *   PATCH /v1/appliances/:id   {label?, durations?: {minS, maxS}} → 204; 404
 *   DELETE /v1/appliances/:id  → 204
 *   GET  /v1/omie              → {days: [{date, start, step, prices}]}: the market prices of today
 *                              and tomorrow, once published (omie.ts; cents per MWh)
 *   POST /v1/import/eredes     {quarters: [ts, Wh, estimated 0|1][]} (≤ 3000, ts = start of the
 *                              quarter hour) → {written}; idempotent (repo/eredes.ts); 413 if too big
 *   GET  /v1/import/eredes     → {quarters, estimated, energyWh, from, to} (from/to null without data)
 *   DELETE /v1/import/eredes   → 204, removes the imported E-Redes data
 *   GET  /v1/energy?from&to    → {meters: [{meter, days, energyWh}]} (≤ 430 days)
 *   GET  /v1/energy/days?meter&from&to → {days: [[date, Wh, minutes | null]]}, the daily totals
 *                              of a meter (≤ 430 days); minutes with data for a Shelly
 *   GET  /v1/energy/quarters?meter&from&to → application/octet-stream, the quarter hours of a
 *                              meter ('eredes' or 'device:channel') as uint32 ts · uint32 Wh (≤ 430 days)
 *   POST /v1/ingest            Authorization: Bearer <device token>; payload in ingest.ts →
 *                              {stored, duplicates, rejected, now}; 400, 401, 413, 429 (Retry-After)
 *   GET  /v1/ingest/missing?c&from&to&limit?  Authorization: Bearer <device token> →
 *                              {missing: [[start, end)…], now}: the minutes of channel c in
 *                              [from, to) (whole minutes, ≤ 11 days) not stored, the oldest
 *                              `limit` gaps at most, to fill from the Shelly's own minute log
 *                              (scripts/shelly-backfill.ts, shelly/wattometro.js 0.4.0+)
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
import { isDatabaseLimit, type Sql } from './db';
import { lisbonDate, nextDate, startOfLisbonDay } from '../../src/lib/time';
import { DEFAULT_REQUESTS_PER_MINUTE, ingest, MAX_INGEST_BYTES } from './ingest';
import { MIN_PASSWORD_LENGTH } from './password';
import {
  createDevice,
  findActiveDeviceByTokenHash,
  listDevices,
  revokeDevice,
  type Device,
} from './repo/devices';
import { databaseState } from './repo/health';
import { installationSchema } from '../../src/domain/installation';
import { tariffInputSchema } from '../../src/domain/tariff';
import { latestMinute, todayByMeter, todayQuarters } from './repo/now';
import { omieDaysFrom } from './repo/omie';
import { t } from '../../src/i18n/pt-PT';
import { deleteAiSettings, getAiSettings, putAiSettings } from './repo/ai-settings';
import {
  createAppliance,
  deleteAppliance,
  listAppliances,
  updateAppliance,
} from './repo/appliances';
import {
  deleteSubscription,
  findSubscription,
  forgetEndpoint,
  saveSubscription,
} from './repo/push';
import { isPushEndpoint, sendPush, type Fetcher, type VapidKeys } from './webpush';
import { missingMinutes } from './repo/readings';
import { MIN_SECRET_LENGTH, open as openSealed, seal } from './secret-box';
import { secondsRecords } from './repo/seconds';
import {
  createSignature,
  deleteSignature,
  listSignatures,
  MAX_SIGNATURE_SECONDS,
  signatureRecords,
} from './repo/signatures';
import { deleteTariff, listTariffs, saveTariff } from './repo/tariffs';
import { getState } from './repo/rollups';
import { rowsReadOn, utcDay } from './repo/usage';
import { STATE } from './rollups';
import {
  getHousehold,
  getHouseholdInstallation,
  getHouseholdLocation,
  renameHousehold,
  setHouseholdInstallation,
  setHouseholdLocation,
} from './repo/households';
import { eredesQuarters, peakMinutes, powerByMeter, topQuarters } from './repo/power';
import {
  deleteEredes,
  dailyEnergy,
  energyMeters,
  eredesSummary,
  importEredes,
  quarterEnergy,
  type DayBounds,
} from './repo/eredes';
import {
  getQualityZone,
  listOutages,
  listVoltage10m,
  minutesOutside,
  QUALITY_ZONES,
  setOutageExcluded,
  setQualityZone,
} from './repo/quality';
import type { User } from './repo/users';

export interface AppConfig {
  sql: Sql;
  /** Secret that signs session cookies (wrangler secret put SESSION_SECRET). */
  sessionSecret: string;
  /** Secret that seals the users' AI keys (wrangler secret put AI_KEY_SECRET); without it, 503. */
  aiKeySecret?: string;
  /** Web Push keys (env.ts, vapidKeys); without them, /v1/push answers 503. */
  vapid?: VapidKeys;
  /** For tests: what posts to the push services. */
  pushFetcher?: Fetcher;
  /** Origins besides the API's own that may send writes (local development). */
  allowedOrigins: string[];
  /** Current time in epoch seconds (tests set it). */
  now?: () => number;
  /** Ingest requests a device may send per minute (catching up sends several). */
  ingestRequestsPerMinute?: number;
  /** Size limit of the D1 database (500 MB on the free plan). */
  databaseLimitBytes?: number;
  /** Rows D1 may read per UTC day (5 000 000 on the free plan). */
  rowsReadLimit?: number;
}

export const DEFAULT_DATABASE_LIMIT_BYTES = 500 * 1000 * 1000;
export const DEFAULT_ROWS_READ_LIMIT = 5_000_000;
const DAY = 86_400;
/** D1's daily limits reset at midnight UTC. */
const nextUtcMidnight = (ts: number) => (Math.floor(ts / DAY) + 1) * DAY;

type AppEnv = { Variables: { user: User } };

const LoginBody = z.object({
  email: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(1024),
});

const PushAlerts = z.object({
  stale: z.boolean(),
  power: z.boolean(),
  database: z.boolean(),
  // Absent from an app cached before migration 0019: off.
  cheapHours: z.boolean().default(false),
});
const PushEndpoint = z.string().max(2000).refine(isPushEndpoint);
const PushSubscriptionBody = z.object({
  endpoint: PushEndpoint,
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
  alerts: PushAlerts,
});
const PushEndpointBody = z.object({ endpoint: PushEndpoint });

const AiSettingsBody = z.object({
  apiKey: z.string().trim().min(1).max(500),
  model: z.string().min(1).max(100),
  autoSend: z.boolean(),
});

const PasswordBody = z.object({
  currentPassword: z.string().min(1).max(1024),
  newPassword: z.string().min(MIN_PASSWORD_LENGTH).max(1024),
});

export const MAX_HOUSEHOLD_NAME = 60;
const HouseholdBody = z.object({ name: z.string().trim().min(1).max(MAX_HOUSEHOLD_NAME) });

export const MAX_LOCATION_NAME = 120;
const LocationBody = z.object({
  location: z
    .object({
      name: z.string().trim().min(1).max(MAX_LOCATION_NAME),
      latitudeCdeg: z.number().int().min(-9000).max(9000),
      longitudeCdeg: z.number().int().min(-18000).max(18000),
    })
    .nullable(),
});

const InstallationBody = z.object({ installation: installationSchema });

export const MAX_DEVICE_NAME = 60;
const DeviceBody = z.object({ name: z.string().trim().min(1).max(MAX_DEVICE_NAME) });

const DAY_SECONDS = 86_400;
export const MAX_QUALITY_DAYS = 93;
export const MAX_OUTAGE_DAYS = 400;
export const MAX_MINUTES_OUTSIDE = 5000;
const epoch = z.coerce.number().int().min(0);
const decivolts = z.coerce.number().int().min(0).max(10_000);
const rangeQuery = (maxDays: number) =>
  z
    .object({ from: epoch, to: epoch })
    .refine(({ from, to }) => from < to && to - from <= maxDays * DAY_SECONDS);
const QualityQuery = rangeQuery(MAX_QUALITY_DAYS).and(
  z.object({ low: decivolts, high: decivolts }),
);
export const TOP_QUARTERS = 10;
export const MAX_PEAK_MINUTES = 1440;
const PeaksQuery = rangeQuery(MAX_QUALITY_DAYS).and(
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
const ApplianceLabel = z.string().trim().min(1).max(60);
/** Up to a day: longer than any cycle pairCycles finds (MAX_CYCLE_S). */
const DurationS = z.number().int().min(1).max(86_400);
const Durations = z
  .object({ minS: DurationS, maxS: DurationS })
  .refine(({ minS, maxS }) => minS <= maxS);
const ApplianceBody = z
  .object({
    label: ApplianceLabel,
    powerW: z.number().int().min(1).max(50_000),
    statesW: z.array(z.number().int().min(-50_000).max(50_000)).min(1).max(8),
    pulsing: z.boolean(),
    minDurationS: DurationS.nullable().default(null),
    maxDurationS: DurationS.nullable().default(null),
    heats: z.number().int().min(1).max(20).nullable().default(null),
  })
  .refine(
    ({ minDurationS, maxDurationS }) =>
      (minDurationS === null) === (maxDurationS === null) &&
      (minDurationS === null || minDurationS <= (maxDurationS as number)),
  );
const ApplianceChange = z
  .object({ label: ApplianceLabel.optional(), durations: Durations.optional() })
  .refine(({ label, durations }) => label !== undefined || durations !== undefined);

const SignatureBody = z
  .object({
    meter: z.string().regex(/^[^:]{1,64}:[0-3]$/),
    label: z.string().trim().min(1).max(60),
    from: z.number().int().min(0),
    to: z.number().int().min(0),
  })
  .refine(({ from, to }) => from < to && to - from <= MAX_SIGNATURE_SECONDS);
export const MAX_IMPORT_QUARTERS = 3000;
export const MAX_IMPORT_BYTES = 256 * 1024;
// 13 months before the current one, plus the current one (src/app/household-energy.ts).
export const MAX_ENERGY_DAYS = 430;
/** Energy of a quarter hour: up to 41,4 kVA for 15 min is 10 350 Wh; more is not a reading. */
const MAX_QUARTER_WH = 20_000;
const ImportBody = z.object({
  quarters: z
    .array(
      z.tuple([
        z.number().int().min(946_684_800).multipleOf(900),
        z.number().int().min(0).max(MAX_QUARTER_WH),
        z.union([z.literal(0), z.literal(1)]),
      ]),
    )
    .min(1)
    .max(MAX_IMPORT_QUARTERS),
});
const EnergyQuery = rangeQuery(MAX_ENERGY_DAYS).and(
  z.object({ meter: z.string().regex(/^(?:eredes|[^:]{1,64}:[0-3])$/) }),
);
const ZoneBody = z.object({ zone: z.enum(QUALITY_ZONES).nullable() });
const ExcludedBody = z.object({ excluded: z.boolean() });

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
    const state = await databaseState(config.sql);
    if (state === 'ok') return c.json({ status: 'ok', database: true });
    return c.json(
      {
        status: 'degraded',
        database: false,
        ...(state === 'limit' ? { limit: { resetsAt: nextUtcMidnight(now()) } } : {}),
      },
      503,
    );
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

  // The user's AI settings, on every device they sign in on (repo/ai-settings.ts).
  const aiSecret = () =>
    config.aiKeySecret && config.aiKeySecret.length >= MIN_SECRET_LENGTH
      ? config.aiKeySecret
      : null;

  app.get('/v1/ai-settings', requireUser, async (c) => {
    const secret = aiSecret();
    if (!secret) return c.json({ error: 'not_configured' }, 503);
    const user = c.get('user');
    const stored = await getAiSettings(config.sql, user);
    const apiKey = stored ? await openSealed(secret, stored.keySealed, user.id) : null;
    if (!stored || apiKey === null) return c.json({ error: 'not_found' }, 404);
    return c.json({
      apiKey,
      model: stored.model,
      autoSend: stored.autoSend,
      updatedAt: stored.updatedAt,
    });
  });

  app.put('/v1/ai-settings', requireUser, async (c) => {
    const secret = aiSecret();
    if (!secret) return c.json({ error: 'not_configured' }, 503);
    const parsed = await body(c, AiSettingsBody);
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    const user = c.get('user');
    await putAiSettings(config.sql, user, {
      keySealed: await seal(secret, parsed.data.apiKey, user.id),
      model: parsed.data.model,
      autoSend: parsed.data.autoSend,
      updatedAt: now(),
    });
    return c.body(null, 204);
  });

  app.delete('/v1/ai-settings', requireUser, async (c) => {
    await deleteAiSettings(config.sql, c.get('user'));
    return c.body(null, 204);
  });

  // Web Push alerts (alerts.ts): this browser's subscription and which alerts it wants.
  app.get('/v1/push/key', requireUser, (c) =>
    config.vapid
      ? c.json({ publicKey: config.vapid.publicKey })
      : c.json({ error: 'not_configured' }, 503),
  );

  app.get('/v1/push/subscription', requireUser, async (c) => {
    const parsed = PushEndpointBody.safeParse({ endpoint: c.req.query('endpoint') });
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    const found = await findSubscription(config.sql, c.get('user'), parsed.data.endpoint);
    return found ? c.json({ alerts: found.alerts }) : c.json({ error: 'not_found' }, 404);
  });

  app.put('/v1/push/subscription', requireUser, async (c) => {
    if (!config.vapid) return c.json({ error: 'not_configured' }, 503);
    const parsed = await body(c, PushSubscriptionBody);
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    const { endpoint, keys, alerts } = parsed.data;
    await saveSubscription(config.sql, c.get('user'), { endpoint, ...keys, alerts }, now());
    return c.body(null, 204);
  });

  app.delete('/v1/push/subscription', requireUser, async (c) => {
    const parsed = await body(c, PushEndpointBody);
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    await deleteSubscription(config.sql, c.get('user'), parsed.data.endpoint);
    return c.body(null, 204);
  });

  app.post('/v1/push/test', requireUser, async (c) => {
    if (!config.vapid) return c.json({ error: 'not_configured' }, 503);
    const parsed = await body(c, PushEndpointBody);
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    const found = await findSubscription(config.sql, c.get('user'), parsed.data.endpoint);
    if (!found) return c.json({ error: 'not_found' }, 404);
    const message = {
      title: t.alerts.testTitle,
      body: t.alerts.testBody,
      tag: 'test',
      url: '/definicoes',
    };
    const result = await sendPush(found, message, config.vapid, now(), config.pushFetcher);
    if (result === 'gone') await forgetEndpoint(config.sql, found.endpoint);
    return result === 'sent' ? c.body(null, 204) : c.json({ error: result }, 502);
  });

  app.put('/v1/household', requireUser, async (c) => {
    const parsed = await body(c, HouseholdBody);
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    const user = c.get('user');
    await renameHousehold(config.sql, user.householdId, parsed.data.name);
    return c.json(await me(user));
  });

  app.get('/v1/household/location', requireUser, async (c) =>
    c.json({ location: await getHouseholdLocation(config.sql, c.get('user').householdId) }),
  );

  app.put('/v1/household/location', requireUser, async (c) => {
    const parsed = await body(c, LocationBody);
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    await setHouseholdLocation(config.sql, c.get('user').householdId, parsed.data.location);
    return c.body(null, 204);
  });

  app.get('/v1/household/installation', requireUser, async (c) =>
    c.json({
      installation: await getHouseholdInstallation(config.sql, c.get('user').householdId),
    }),
  );

  app.put('/v1/household/installation', requireUser, async (c) => {
    const parsed = await body(c, InstallationBody);
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    const { householdId } = c.get('user');
    await setHouseholdInstallation(config.sql, householdId, parsed.data.installation, now());
    return c.body(null, 204);
  });

  app.get('/v1/omie', requireUser, async (c) =>
    c.json({ days: await omieDaysFrom(config.sql, lisbonDate(now())) }),
  );

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
        rowsReadToday: await rowsReadOn(config.sql, utcDay(at)),
        rowsReadLimit: config.rowsReadLimit ?? DEFAULT_ROWS_READ_LIMIT,
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

  app.get('/v1/power', requireUser, async (c) => {
    const parsed = rangeQuery(MAX_QUALITY_DAYS).safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    const { from, to } = parsed.data;
    const { householdId } = c.get('user');
    const meters = [];
    for (const meter of await powerByMeter(config.sql, householdId, from, to)) {
      const [deviceId = '', channel] = meter.meter.split(':');
      const top = await topQuarters(
        config.sql,
        householdId,
        deviceId,
        Number(channel),
        from,
        to,
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
      eredes: await eredesQuarters(config.sql, householdId, from, to),
    });
  });

  app.get('/v1/power/peaks', requireUser, async (c) => {
    const parsed = PeaksQuery.safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    const { meter, from, to, threshold } = parsed.data;
    const [deviceId = '', channel] = meter.split(':');
    const peaks = await peakMinutes(
      config.sql,
      c.get('user').householdId,
      deviceId,
      Number(channel),
      from,
      to,
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

  // Named appliances (Phase 8.3): the browser classifies cycles with their descriptors.
  app.get('/v1/appliances', requireUser, async (c) =>
    c.json({ appliances: await listAppliances(config.sql, c.get('user').householdId) }),
  );

  app.post('/v1/appliances', requireUser, async (c) => {
    const parsed = await body(c, ApplianceBody);
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    const appliance = await createAppliance(
      config.sql,
      c.get('user').householdId,
      parsed.data,
      now(),
    );
    if (!appliance) return c.json({ error: 'too_many' }, 409);
    return c.json({ appliance }, 201);
  });

  app.patch('/v1/appliances/:id', requireUser, async (c) => {
    const parsed = await body(c, ApplianceChange);
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    const { label, durations } = parsed.data;
    const updated = await updateAppliance(
      config.sql,
      c.get('user').householdId,
      c.req.param('id'),
      {
        ...(label !== undefined ? { label } : {}),
        ...(durations !== undefined ? { durations } : {}),
      },
    );
    return updated ? c.body(null, 204) : c.json({ error: 'not_found' }, 404);
  });

  app.delete('/v1/appliances/:id', requireUser, async (c) => {
    await deleteAppliance(config.sql, c.get('user').householdId, c.req.param('id'));
    return c.body(null, 204);
  });

  app.post('/v1/signatures', requireUser, async (c) => {
    const parsed = await body(c, SignatureBody);
    if (!parsed.success || parsed.data.to > now()) {
      return c.json({ error: 'invalid_request' }, 400);
    }
    const { meter, label, from, to } = parsed.data;
    const [deviceId = '', channel] = meter.split(':');
    const { householdId } = c.get('user');
    const known = (await listDevices(config.sql, householdId)).some((d) => d.id === deviceId);
    if (!known) return c.json({ error: 'not_found' }, 404);
    const signature = await createSignature(
      config.sql,
      householdId,
      { deviceId, channel: Number(channel), label, from, to },
      now(),
    );
    if (!signature) return c.json({ error: 'no_seconds' }, 409);
    return c.json({ signature }, 201);
  });

  app.get('/v1/signatures', requireUser, async (c) =>
    c.json({ signatures: await listSignatures(config.sql, c.get('user').householdId) }),
  );

  app.get('/v1/signatures/:id/seconds', requireUser, async (c) => {
    const records = await signatureRecords(
      config.sql,
      c.get('user').householdId,
      c.req.param('id'),
    );
    if (!records) return c.json({ error: 'not_found' }, 404);
    c.header('Content-Type', 'application/octet-stream');
    return c.body(records.buffer as ArrayBuffer);
  });

  app.delete('/v1/signatures/:id', requireUser, async (c) => {
    await deleteSignature(config.sql, c.get('user').householdId, c.req.param('id'));
    return c.body(null, 204);
  });

  app.post('/v1/import/eredes', requireUser, async (c) => {
    if (Number(c.req.header('Content-Length') ?? 0) > MAX_IMPORT_BYTES) {
      return c.json({ error: 'too_large' }, 413);
    }
    const parsed = await body(c, ImportBody);
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    const { quarters } = parsed.data;
    let first = Infinity;
    let last = -Infinity;
    for (const [ts] of quarters) {
      first = Math.min(first, ts);
      last = Math.max(last, ts);
    }
    // Nothing from the future, and a batch spans about a month.
    if (last > now() || last - first > (MAX_IMPORT_QUARTERS + 96) * 900) {
      return c.json({ error: 'invalid_request' }, 400);
    }
    const days: DayBounds[] = [];
    for (let day = lisbonDate(first); day <= lisbonDate(last); day = nextDate(day)) {
      days.push([day, startOfLisbonDay(day), startOfLisbonDay(nextDate(day))]);
    }
    const written = await importEredes(config.sql, c.get('user').householdId, quarters, days);
    return c.json({ written });
  });

  app.get('/v1/import/eredes', requireUser, async (c) =>
    c.json(await eredesSummary(config.sql, c.get('user').householdId)),
  );

  app.delete('/v1/import/eredes', requireUser, async (c) => {
    await deleteEredes(config.sql, c.get('user').householdId);
    return c.body(null, 204);
  });

  app.get('/v1/energy', requireUser, async (c) => {
    const parsed = rangeQuery(MAX_ENERGY_DAYS).safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    const { from, to } = parsed.data;
    // The Lisbon days that overlap [from, to).
    const meters = await energyMeters(
      config.sql,
      c.get('user').householdId,
      lisbonDate(from),
      lisbonDate(to - 1),
    );
    return c.json({ meters });
  });

  app.get('/v1/energy/days', requireUser, async (c) => {
    const parsed = EnergyQuery.safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    const { meter, from, to } = parsed.data;
    const days = await dailyEnergy(
      config.sql,
      c.get('user').householdId,
      meter,
      lisbonDate(from),
      lisbonDate(to - 1),
    );
    return c.json({ days });
  });

  app.get('/v1/energy/quarters', requireUser, async (c) => {
    const parsed = EnergyQuery.safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    const { meter, from, to } = parsed.data;
    const records = await quarterEnergy(config.sql, c.get('user').householdId, meter, from, to);
    c.header('Content-Type', 'application/octet-stream');
    return c.body(records.buffer as ArrayBuffer);
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

  app.notFound((c) => c.json({ error: 'not_found' }, 404));
  app.onError((error, c) => {
    if (!isDatabaseLimit(error)) return c.json({ error: 'internal' }, 500);
    // The Shelly retries a 5xx later (shelly/wattometro.js); the app explains it.
    const resetsAt = nextUtcMidnight(now());
    c.header('Retry-After', String(resetsAt - now()));
    return c.json({ error: 'database_limit', resetsAt }, 503);
  });

  return app;
}
