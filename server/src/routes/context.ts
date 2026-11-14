// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * What the route modules share: the configuration, the signed-in user, the
 * checks every write goes through, and the limits more than one area uses.
 */
import { type Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import { z } from 'zod';
import { readSession, SESSION_COOKIE, SESSION_SECONDS, signSession } from '../auth';
import { type Sql } from '../db';
import { type Fetcher, type VapidKeys } from '../webpush';
import { type BodyFetcher } from '../pvgis';
import { type WorkersAi } from '../ai-free';
import { getHousehold } from '../repo/households';
import type { User } from '../repo/users';

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
  /** Administrators' emails, lower case (env.ts): they get GET /v1/admin/stats. */
  adminEmails?: string[];
  /** For tests: what asks PVGIS (pvgis.ts). */
  pvgisFetcher?: BodyFetcher;
  /** Workers AI (the `AI` binding): the free AI (ai-free.ts); without it, 503. */
  ai?: WorkersAi;
}

export const DEFAULT_DATABASE_LIMIT_BYTES = 500 * 1000 * 1000;

export const DEFAULT_ROWS_READ_LIMIT = 5_000_000;

/** Seconds in a day (UTC: D1's limits, and the length of a query range). */
export const DAY = 86_400;

export type AppEnv = { Variables: { user: User } };

export const epoch = z.coerce.number().int().min(0);

export const rangeQuery = (maxDays: number) =>
  z
    .object({ from: epoch, to: epoch })
    .refine(({ from, to }) => from < to && to - from <= maxDays * DAY);

export const ApplianceLabel = z.string().trim().min(1).max(60);

export const COOKIE_OPTIONS = {
  path: '/',
  httpOnly: true,
  secure: true,
  sameSite: 'Strict',
  prefix: 'host',
} as const;

/** What every route module needs: built once per app (createApp). */
export function createContext(config: AppConfig) {
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

  const isAdmin = (user: User) => (config.adminEmails ?? []).includes(user.email.toLowerCase());

  const me = async (user: User) => ({
    email: user.email,
    householdId: user.householdId,
    householdName: (await getHousehold(config.sql, user.householdId))?.name ?? '',
    admin: isAdmin(user),
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

  return { config, now, requireUser, body, trustedOrigin, startSession, me, isAdmin };
}

export type RouteContext = ReturnType<typeof createContext>;
