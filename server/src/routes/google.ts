// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Google Drive sign-in for the local mode (no account, so no session; docs/google-drive.md):
 * adds the app's client secret and passes the request on to Google, storing and logging nothing.
 *
 *   POST /v1/google/token {grant: 'code', code, codeVerifier, redirectUri}
 *                         {grant: 'refresh', refreshToken}
 *        → {accessToken, expiresIn, refreshToken?}; 403 forbidden_origin, 400 invalid_request or
 *          invalid_redirect, 401 sign_in_again, 404 without the Google app, 502 unavailable
 */
import type { Hono } from 'hono';
import { googleToken, GoogleTokenError } from '../google-token';
import { type AppEnv, type RouteContext } from './context';

/** Where `pnpm dev` serves the app: its return address is always accepted. */
const DEV_ORIGIN = 'http://localhost:5173';

export function googleRoutes(app: Hono<AppEnv>, { config, trustedOrigin }: RouteContext): void {
  app.post('/v1/google/token', async (c) => {
    if (!trustedOrigin(c)) return c.json({ error: 'forbidden_origin' }, 403);
    try {
      return c.json(
        await googleToken({
          body: await c.req.json().catch(() => null),
          app: config.google,
          allowedOrigins: [new URL(c.req.url).origin, ...config.allowedOrigins, DEV_ORIGIN],
          fetch: config.googleFetch ?? ((input, init) => fetch(input, init)),
        }),
      );
    } catch (error) {
      if (!(error instanceof GoogleTokenError)) throw error;
      return c.json({ error: error.message }, error.status);
    }
  });
}
