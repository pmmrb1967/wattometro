// SPDX-License-Identifier: AGPL-3.0-or-later
/** Cloudflare Worker entry point. Configuration in server/wrangler.toml. */
import { createApp } from './app';
import { d1, type Sql } from './db';
import { allowedOrigins, positiveInteger, type Env } from './env';
import { addRowsRead, utcDay } from './repo/usage';
import { runMaintenance } from './rollups';

interface ScheduledEventLike {
  scheduledTime: number;
}
interface ContextLike {
  waitUntil(promise: Promise<unknown>): void;
}

/** Adds what this request or Cron run read to today's count (repo/usage.ts). */
async function countRowsRead(sql: Sql): Promise<void> {
  try {
    await addRowsRead(sql, utcDay(Math.floor(Date.now() / 1000)), sql.rowsRead?.() ?? 0);
  } catch {
    // Past the daily limit the count cannot be written either; it is not needed then.
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ContextLike): Promise<Response> {
    const limitMb = positiveInteger(env.DATABASE_LIMIT_MB);
    const rowsReadLimit = positiveInteger(env.ROWS_READ_LIMIT);
    const sql = d1(env.DB);
    const app = createApp({
      sql,
      sessionSecret: env.SESSION_SECRET,
      ...(env.AI_KEY_SECRET ? { aiKeySecret: env.AI_KEY_SECRET } : {}),
      allowedOrigins: allowedOrigins(env),
      ingestRequestsPerMinute: positiveInteger(env.INGEST_REQUESTS_PER_MINUTE),
      ...(limitMb !== undefined ? { databaseLimitBytes: limitMb * 1000 * 1000 } : {}),
      ...(rowsReadLimit !== undefined ? { rowsReadLimit } : {}),
    });
    const response = await app.fetch(request);
    ctx.waitUntil(countRowsRead(sql));
    return response;
  },

  /** Cron (server/wrangler.toml): rollups, retention, database size. */
  async scheduled(event: ScheduledEventLike, env: Env): Promise<void> {
    const sql = d1(env.DB);
    try {
      await runMaintenance(sql, Math.floor(event.scheduledTime / 1000), {
        retention1mDays: positiveInteger(env.RETENTION_1M_DAYS),
        retention1sDays: positiveInteger(env.RETENTION_1S_DAYS),
      });
    } finally {
      await countRowsRead(sql);
    }
  },
};
