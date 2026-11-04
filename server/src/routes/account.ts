// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Sign-in, sign-out and the password (auth.ts).
 *
 *   POST /v1/auth/login        {email, password} → Me + session cookie;
 *                              401 invalid_credentials, 429 locked (Retry-After)
 *   POST /v1/auth/logout       → 204, clears the cookie
 *   GET  /v1/auth/me           → Me, or 401 unauthenticated
 *   POST /v1/account/password  {currentPassword, newPassword} → 204 + new cookie;
 *                              403 wrong_password, 429 locked; other devices are signed out
 */
import type { Hono } from 'hono';
import { deleteCookie } from 'hono/cookie';
import { z } from 'zod';
import { changePassword, login, SESSION_COOKIE } from '../auth';
import { MIN_PASSWORD_LENGTH } from '../password';
import { COOKIE_OPTIONS, type AppEnv, type RouteContext } from './context';

const LoginBody = z.object({
  email: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(1024),
});

const PasswordBody = z.object({
  currentPassword: z.string().min(1).max(1024),
  newPassword: z.string().min(MIN_PASSWORD_LENGTH).max(1024),
});

export function accountRoutes(
  app: Hono<AppEnv>,
  { config, now, requireUser, body, trustedOrigin, startSession, me }: RouteContext,
): void {
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
}
