// SPDX-License-Identifier: AGPL-3.0-or-later
/** Cloudflare Worker entry point. Configuration in server/wrangler.toml. */
import { createApp } from './app';
import { d1 } from './db';
import { allowedOrigins, positiveInteger, type Env } from './env';
import { runMaintenance } from './rollups';

interface ScheduledEventLike {
  scheduledTime: number;
}

export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    const limitMb = positiveInteger(env.DATABASE_LIMIT_MB);
    const app = createApp({
      sql: d1(env.DB),
      sessionSecret: env.SESSION_SECRET,
      allowedOrigins: allowedOrigins(env),
      ingestRequestsPerMinute: positiveInteger(env.INGEST_REQUESTS_PER_MINUTE),
      ...(limitMb !== undefined ? { databaseLimitBytes: limitMb * 1000 * 1000 } : {}),
    });
    return app.fetch(request);
  },

  /** Cron (server/wrangler.toml): rollups, retention, database size. */
  async scheduled(event: ScheduledEventLike, env: Env): Promise<void> {
    await runMaintenance(d1(env.DB), Math.floor(event.scheduledTime / 1000), {
      retention1mDays: positiveInteger(env.RETENTION_1M_DAYS),
      retention1sDays: positiveInteger(env.RETENTION_1S_DAYS),
    });
  },
};
