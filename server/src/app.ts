// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * API routes (Hono). The Worker stays thin: validate, call repo/, answer.
 * Routes never write SQL (CLAUDE.md, rule 5); the API is versioned (/v1).
 * It is same-origin with the app (gateway.ts), so there is no CORS.
 *
 *   GET  /v1/health            → {status: 'ok' | 'degraded', database: boolean}; past D1's
 *                              daily limit also limit: {resetsAt} (503)
 *
 * The routes live by area in routes/ (each file lists its own); routes/context.ts
 * holds what they share.
 *
 * Me = {email, householdId, householdName}. Every signed-in request renews an
 * older session cookie (sliding expiry, auth.ts). /v1/ingest is for devices:
 * no cookie, no Origin.
 */
import { Hono } from 'hono';
import { isDatabaseLimit } from './db';
import { databaseState } from './repo/health';
import { createContext, DAY, type AppConfig, type AppEnv } from './routes/context';
import { accountRoutes } from './routes/account';
import { aiSettingsRoutes } from './routes/ai-settings';
import { freeAiRoutes } from './routes/ai-free';
import { pushRoutes } from './routes/push';
import { householdRoutes } from './routes/household';
import { devicesRoutes } from './routes/devices';
import { nowRoutes } from './routes/now';
import { tariffsRoutes } from './routes/tariffs';
import { qualityRoutes } from './routes/quality';
import { adminRoutes } from './routes/admin';
import { powerRoutes } from './routes/power';
import { nilmRoutes } from './routes/nilm';
import { solarRoutes } from './routes/solar';
import { equipmentRoutes } from './routes/equipment';
import { energyRoutes } from './routes/energy';

export { DEFAULT_ROWS_READ_LIMIT } from './routes/context';
export { MAX_IMPORT_QUARTERS } from './routes/energy';
export type { AppConfig } from './routes/context';

/** D1's daily limits reset at midnight UTC. */
const nextUtcMidnight = (ts: number) => (Math.floor(ts / DAY) + 1) * DAY;

export function createApp(config: AppConfig): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  const context = createContext(config);
  const { now } = context;

  app.use('/v1/*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store');
    // The static files get dist/_headers (security-headers.ts); the API's answers set their own.
    c.header('X-Content-Type-Options', 'nosniff');
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

  accountRoutes(app, context);
  aiSettingsRoutes(app, context);
  freeAiRoutes(app, context);
  pushRoutes(app, context);
  householdRoutes(app, context);
  devicesRoutes(app, context);
  nowRoutes(app, context);
  tariffsRoutes(app, context);
  qualityRoutes(app, context);
  adminRoutes(app, context);
  powerRoutes(app, context);
  nilmRoutes(app, context);
  solarRoutes(app, context);
  equipmentRoutes(app, context);
  energyRoutes(app, context);

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
