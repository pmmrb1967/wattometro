// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The last minute and today so far, for the home page.
 *
 *   GET  /v1/now               → {now, dayStart, meters: [{deviceId, deviceName, channel, lastSeenAt,
 *                              latest: minute | null, today: {minutes, energyWh, powerMaxW,
 *                              quarters: [{ts, energyWh}]}}], database: {sizeBytes, limitBytes,
 *                              rowsReadToday, rowsReadLimit}}
 *                              (today = since Lisbon midnight)
 */
import type { Hono } from 'hono';
import { floorTo, lisbonDate, QUARTER_HOUR, startOfLisbonDay } from '../../../src/lib/time';
import { listDevices } from '../repo/devices';
import { latestMinute, todayQuarters } from '../repo/now';
import { getState } from '../repo/rollups';
import { rowsReadOn, utcDay } from '../repo/usage';
import { STATE } from '../rollups';
import {
  DEFAULT_DATABASE_LIMIT_BYTES,
  DEFAULT_ROWS_READ_LIMIT,
  type AppEnv,
  type RouteContext,
} from './context';

export function nowRoutes(app: Hono<AppEnv>, { config, now, requireUser }: RouteContext): void {
  app.get('/v1/now', requireUser, async (c) => {
    const { householdId } = c.get('user');
    const at = now();
    const dayStart = startOfLisbonDay(lisbonDate(at));
    const devices = (await listDevices(config.sql, householdId)).filter(
      (d) => d.revokedAt === null,
    );
    const until = await getState(config.sql, STATE.rolledUpUntil(householdId));
    const cutoff = Math.max(dayStart, until === null ? dayStart : floorTo(until, QUARTER_HOUR));
    const quarters = await todayQuarters(config.sql, householdId, dayStart, cutoff);
    const today: {
      deviceId: string;
      channel: number;
      minutes: number;
      energyWh: number;
      powerMaxW: number | null;
    }[] = [];
    for (const quarter of quarters) {
      const sums = today.find(
        (item) => item.deviceId === quarter.deviceId && item.channel === quarter.channel,
      );
      if (!sums) {
        today.push({ ...quarter });
        continue;
      }
      sums.minutes += quarter.minutes;
      sums.energyWh += quarter.energyWh;
      if (quarter.powerMaxW !== null) {
        sums.powerMaxW = Math.max(sums.powerMaxW ?? quarter.powerMaxW, quarter.powerMaxW);
      }
    }
    const meters = [];
    for (const device of devices) {
      const measured = today.filter((meter) => meter.deviceId === device.id);
      // A device without data today still shows, on its main channel.
      const channels = measured.length > 0 ? measured.map((meter) => meter.channel) : [0];
      for (const channel of channels) {
        const sums = measured.find((meter) => meter.channel === channel);
        meters.push({
          deviceId: device.id,
          deviceName: device.name,
          channel,
          lastSeenAt: device.lastSeenAt,
          latest: await latestMinute(config.sql, householdId, device.id, channel),
          today: {
            minutes: sums?.minutes ?? 0,
            energyWh: sums?.energyWh ?? 0,
            powerMaxW: sums?.powerMaxW ?? null,
            quarters: quarters
              .filter((q) => q.deviceId === device.id && q.channel === channel)
              .map((q) => ({ ts: q.ts, energyWh: q.energyWh })),
          },
        });
      }
    }
    return c.json({
      now: at,
      dayStart,
      meters,
      database: {
        sizeBytes: await getState(config.sql, STATE.databaseBytes),
        limitBytes: config.databaseLimitBytes ?? DEFAULT_DATABASE_LIMIT_BYTES,
        rowsReadToday: await rowsReadOn(config.sql, utcDay(at)),
        rowsReadLimit: config.rowsReadLimit ?? DEFAULT_ROWS_READ_LIMIT,
      },
    });
  });
}
