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
 *
 * Me = {email, householdId, householdName}. Every signed-in request renews an
 * older session cookie (sliding expiry, auth.ts).
 */
import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import { z } from 'zod';
import {
  changePassword,
  login,
  readSession,
  SESSION_COOKIE,
  SESSION_SECONDS,
  signSession,
} from './auth';
import type { Sql } from './db';
import { MIN_PASSWORD_LENGTH } from './password';
import { databaseReachable } from './repo/health';
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
}

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

  app.notFound((c) => c.json({ error: 'not_found' }, 404));
  app.onError((_error, c) => c.json({ error: 'internal' }, 500));

  return app;
}
