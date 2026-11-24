// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The household copy (docs/backup.md): the browser reads the house a page at a
 * time, seals the file with the account password and saves it; putting one back
 * sends its rows here, which join what the house has (repo/backup.ts).
 *
 *   GET  /v1/backup             → {lastAt, remindDays, estimateRows, rowsReadLimit}
 *   PUT  /v1/backup/reminder    {days: 7 | 15 | 30 | 0} → 204
 *   POST /v1/backup/password    {password} → 204 the account's; 403 wrong_password,
 *                              429 locked (the login's limits: auth.ts)
 *   GET  /v1/backup/export?section&cursor? → {rows, next} (cursor: JSON, the page's `next`)
 *   POST /v1/backup/done        → {lastAt}: the file was saved
 *   POST /v1/backup/restore     {section, rows} → {written}; 413 too large
 *
 * Export and restore answer 503 {error: 'busy', retryAt} once today's rows read
 * (or written) pass a share of D1's daily limit: a copy must never stop the
 * Shelly's minutes. The browser goes on after retryAt (midnight UTC).
 */
import type { Hono } from 'hono';
import { z } from 'zod';
import { remindDaysSchema, restoreBodySchema, sectionSchema } from '../../../src/backup/format';
import { addressKey, login } from '../auth';
import {
  backupEstimate,
  exportPage,
  getBackupState,
  recordBackup,
  restoreRows,
  setRemindDays,
} from '../repo/backup';
import { rowsReadOn, rowsWrittenOn, utcDay } from '../repo/usage';
import { ROWS_WRITTEN_LIMIT } from './admin';
import { DAY, DEFAULT_ROWS_READ_LIMIT, type AppEnv, type RouteContext } from './context';

/** A copy reads only while the day's rows read are under this share of the limit. */
export const EXPORT_READ_SHARE = 0.6;
/** And puts rows back only while the day's rows written are under this share. */
export const RESTORE_WRITE_SHARE = 0.6;
/** Largest body of POST /v1/backup/restore (the browser sends less: src/backup/restore.ts). */
export const MAX_RESTORE_BYTES = 1_000_000;

const ReminderBody = z.object({ days: remindDaysSchema });
const PasswordBody = z.object({ password: z.string().min(1).max(1024) });
const ExportQuery = z.object({
  section: sectionSchema,
  cursor: z
    .string()
    .max(1000)
    .optional()
    .transform((text, context) => {
      if (text === undefined) return null;
      const parsed = z
        .array(z.union([z.string().max(200), z.number().int()]))
        .min(1)
        .max(3)
        .safeParse(JSON.parse(text === '' ? 'null' : text));
      if (!parsed.success) {
        context.addIssue({ code: 'custom', message: 'invalid cursor' });
        return z.NEVER;
      }
      return parsed.data;
    }),
});

export function backupRoutes(
  app: Hono<AppEnv>,
  { config, now, requireUser, body }: RouteContext,
): void {
  const rowsReadLimit = config.rowsReadLimit ?? DEFAULT_ROWS_READ_LIMIT;
  const busy = { error: 'busy', retryAt: 0 };
  const nextMidnight = () => (Math.floor(now() / DAY) + 1) * DAY;

  app.get('/v1/backup', requireUser, async (c) => {
    const householdId = c.get('user').householdId;
    const state = await getBackupState(config.sql, householdId);
    return c.json({
      ...state,
      estimateRows: await backupEstimate(config.sql, householdId),
      rowsReadLimit,
    });
  });

  app.put('/v1/backup/reminder', requireUser, async (c) => {
    const parsed = await body(c, ReminderBody);
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    await setRemindDays(config.sql, c.get('user').householdId, parsed.data.days, now());
    return c.body(null, 204);
  });

  app.post('/v1/backup/password', requireUser, async (c) => {
    const parsed = await body(c, PasswordBody);
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    const address = await addressKey(c.req.header('CF-Connecting-IP'), config.sessionSecret);
    const result = await login(
      config.sql,
      c.get('user').email,
      parsed.data.password,
      address,
      now(),
    );
    if (result.ok) return c.body(null, 204);
    if (result.reason === 'locked') {
      c.header('Retry-After', String(result.retryAfter));
      return c.json({ error: 'locked', retryAfter: result.retryAfter }, 429);
    }
    return c.json({ error: 'wrong_password' }, 403);
  });

  app.get('/v1/backup/export', requireUser, async (c) => {
    let parsed;
    try {
      parsed = ExportQuery.safeParse(c.req.query());
    } catch {
      parsed = null;
    }
    if (!parsed?.success) return c.json({ error: 'invalid_request' }, 400);
    if ((await rowsReadOn(config.sql, utcDay(now()))) >= EXPORT_READ_SHARE * rowsReadLimit) {
      return c.json({ ...busy, retryAt: nextMidnight() }, 503);
    }
    const { section, cursor } = parsed.data;
    return c.json(await exportPage(config.sql, c.get('user').householdId, section, cursor));
  });

  app.post('/v1/backup/done', requireUser, async (c) => {
    const at = now();
    await recordBackup(config.sql, c.get('user').householdId, at);
    return c.json({ lastAt: at });
  });

  app.post('/v1/backup/restore', requireUser, async (c) => {
    const text = await c.req.text();
    if (text.length > MAX_RESTORE_BYTES) return c.json({ error: 'too_large' }, 413);
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      // Answered below.
    }
    const parsed = restoreBodySchema.safeParse(json);
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    if (
      (await rowsWrittenOn(config.sql, utcDay(now()))) >=
      RESTORE_WRITE_SHARE * ROWS_WRITTEN_LIMIT
    ) {
      return c.json({ ...busy, retryAt: nextMidnight() }, 503);
    }
    const { section, rows } = parsed.data;
    const written = await restoreRows(config.sql, c.get('user').householdId, section, rows, now());
    return c.json({ written });
  });
}
