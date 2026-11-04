// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Page visits and the administrator's panel (docs/admin.md).
 *
 */
import type { Hono } from 'hono';
import { z } from 'zod';
import { floorTo, lisbonDate, QUARTER_HOUR, startOfLisbonDay } from '../../../src/lib/time';
import { listDevices } from '../repo/devices';
import { VISIT_PAGES } from '../../../src/lib/pages';
import { accountTotals, recordVisit, visitsSince } from '../repo/admin';
import { todayQuarters } from '../repo/now';
import { getState } from '../repo/rollups';
import { usageSince, utcDay } from '../repo/usage';
import { STATE } from '../rollups';
import { listHouseholdIds } from '../repo/households';
import {
  DAY,
  DEFAULT_DATABASE_LIMIT_BYTES,
  DEFAULT_ROWS_READ_LIMIT,
  type AppEnv,
  type RouteContext,
} from './context';

/** Rows D1 may write per UTC day on the free plan. */
export const ROWS_WRITTEN_LIMIT = 100_000;

/** Days of visits the administrator's panel shows. */
const VISIT_DAYS = 30;

const VisitBody = z.object({ page: z.enum(VISIT_PAGES) });

export function adminRoutes(
  app: Hono<AppEnv>,
  { config, now, requireUser, body, isAdmin }: RouteContext,
): void {
  app.post('/v1/visit', requireUser, async (c) => {
    const parsed = await body(c, VisitBody);
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    await recordVisit(config.sql, lisbonDate(now()), parsed.data.page);
    return c.body(null, 204);
  });

  app.get('/v1/admin/stats', requireUser, async (c) => {
    if (!isAdmin(c.get('user'))) return c.json({ error: 'forbidden' }, 403);
    const at = now();
    const dayStart = startOfLisbonDay(lisbonDate(at));
    const devices = [];
    let rolledUpUntil: number | null = null;
    for (const householdId of await listHouseholdIds(config.sql)) {
      const until = await getState(config.sql, STATE.rolledUpUntil(householdId));
      if (until !== null) rolledUpUntil = Math.min(rolledUpUntil ?? until, until);
      const cutoff = Math.max(dayStart, until === null ? dayStart : floorTo(until, QUARTER_HOUR));
      const quarters = await todayQuarters(config.sql, householdId, dayStart, cutoff);
      for (const device of await listDevices(config.sql, householdId)) {
        if (device.revokedAt !== null) continue;
        // The main channel's minutes; the expected ones since midnight or since it was added.
        const minutesToday = quarters
          .filter((quarter) => quarter.deviceId === device.id && quarter.channel === 0)
          .reduce((total, quarter) => total + quarter.minutes, 0);
        devices.push({
          model: device.model,
          scriptVersion: device.scriptVersion,
          lastSeenAt: device.lastSeenAt,
          minutesToday,
          expectedToday: Math.floor((at - Math.max(dayStart, device.createdAt)) / 60),
        });
      }
    }
    return c.json({
      now: at,
      limits: {
        rowsRead: config.rowsReadLimit ?? DEFAULT_ROWS_READ_LIMIT,
        rowsWritten: ROWS_WRITTEN_LIMIT,
        databaseBytes: config.databaseLimitBytes ?? DEFAULT_DATABASE_LIMIT_BYTES,
      },
      days: await usageSince(config.sql, utcDay(at - 6 * DAY)),
      databaseBytes: await getState(config.sql, STATE.databaseBytes),
      cron: { rolledUpUntil, purgedAt: await getState(config.sql, STATE.purgedAt) },
      accounts: await accountTotals(config.sql),
      devices,
      visits: {
        days: VISIT_DAYS,
        pages: await visitsSince(
          config.sql,
          lisbonDate(at - (VISIT_DAYS - 1) * DAY),
          lisbonDate(at),
        ),
      },
    });
  });
}
