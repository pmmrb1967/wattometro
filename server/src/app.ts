// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * API routes (Hono). The Worker stays thin: validate, call repo/, answer.
 * Routes never write SQL (CLAUDE.md, rule 5); the API is versioned (/v1).
 *
 *   GET /v1/health   → {status: 'ok' | 'degraded', database: boolean}
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Sql } from './db';
import { databaseReachable } from './repo/health';

export interface AppConfig {
  sql: Sql;
  /** Origins of the app allowed to call the API, e.g. https://app.wattometro.workers.dev */
  allowedOrigins: string[];
}

export function createApp(config: AppConfig): Hono {
  const app = new Hono();

  app.use(
    '/v1/*',
    cors({
      origin: (origin) => (config.allowedOrigins.includes(origin) ? origin : null),
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
      maxAge: 86_400,
    }),
  );

  app.get('/v1/health', async (c) => {
    const database = await databaseReachable(config.sql);
    c.header('Cache-Control', 'no-store');
    return c.json({ status: database ? 'ok' : 'degraded', database }, database ? 200 : 503);
  });

  app.notFound((c) => c.json({ error: 'not_found' }, 404));
  app.onError((_error, c) => c.json({ error: 'internal' }, 500));

  return app;
}
