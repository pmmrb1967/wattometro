// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * API routes (Hono). The Worker stays thin: validate, call repo/, answer.
 * Routes never write SQL (CLAUDE.md, rule 5); the API is versioned (/v1).
 * It is same-origin with the app (gateway.ts), so there is no CORS.
 *
 *   GET  /v1/health       → {status: 'ok' | 'degraded', database: boolean}
 *   POST /v1/auth/login   {email, password} → {email, householdId} + session cookie;
 *                         401 invalid_credentials, 429 locked (Retry-After)
 *   POST /v1/auth/logout  → 204, clears the cookie
 *   GET  /v1/auth/me      → {email, householdId}, or 401 unauthenticated
 */
import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import { z } from 'zod';
import { login, readSession, SESSION_COOKIE, SESSION_SECONDS, signSession } from './auth';
import type { Sql } from './db';
import { databaseReachable } from './repo/health';
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

  const requireUser = createMiddleware<AppEnv>(async (c, next) => {
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD' && !trustedOrigin(c)) {
      return c.json({ error: 'forbidden_origin' }, 403);
    }
    const token = getCookie(c, SESSION_COOKIE, 'host');
    const user = token ? await readSession(config.sql, token, config.sessionSecret, now()) : null;
    if (!user) return c.json({ error: 'unauthenticated' }, 401);
    c.set('user', user);
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
    const body = LoginBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'invalid_request' }, 400);

    const result = await login(config.sql, body.data.email, body.data.password, now());
    if (!result.ok) {
      if (result.reason === 'locked') {
        c.header('Retry-After', String(result.retryAfter));
        return c.json({ error: 'locked', retryAfter: result.retryAfter }, 429);
      }
      return c.json({ error: 'invalid_credentials' }, 401);
    }
    const token = await signSession(result.user, config.sessionSecret, now());
    setCookie(c, SESSION_COOKIE, token, { ...COOKIE_OPTIONS, maxAge: SESSION_SECONDS });
    return c.json({ email: result.user.email, householdId: result.user.householdId });
  });

  app.post('/v1/auth/logout', (c) => {
    if (!trustedOrigin(c)) return c.json({ error: 'forbidden_origin' }, 403);
    deleteCookie(c, SESSION_COOKIE, COOKIE_OPTIONS);
    return c.body(null, 204);
  });

  app.get('/v1/auth/me', requireUser, (c) => {
    const user = c.get('user');
    return c.json({ email: user.email, householdId: user.householdId });
  });

  app.notFound((c) => c.json({ error: 'not_found' }, 404));
  app.onError((_error, c) => c.json({ error: 'internal' }, 500));

  return app;
}
