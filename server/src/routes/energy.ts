// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The E-Redes import and the energy by day and quarter hour.
 *
 *   POST /v1/import/eredes     {quarters: [ts, Wh, estimated 0|1][]} (≤ 3000, ts = start of the
 *                              quarter hour) → {written}; idempotent (repo/eredes.ts); 413 if too big
 *   GET  /v1/import/eredes     → {quarters, estimated, energyWh, from, to, days: [day, quarters,
 *                              estimated][]} (from/to null without data; days oldest first)
 *   DELETE /v1/import/eredes   → 204, removes the imported E-Redes data
 *   GET  /v1/energy?from&to    → {meters: [{meter, days, energyWh}]} (≤ 430 days)
 *   GET  /v1/energy/days?meter&from&to → {days: [[date, Wh, minutes | null]]}, the daily totals
 *                              of a meter (≤ 430 days); minutes with data for a Shelly
 *   GET  /v1/energy/quarters?meter&from&to → application/octet-stream, the quarter hours of a
 *                              meter ('eredes' or 'device:channel') as uint32 ts · uint32 Wh (≤ 430 days)
 */
import type { Hono } from 'hono';
import { z } from 'zod';
import { lisbonDate, nextDate, startOfLisbonDay } from '../../../src/lib/time';
import {
  deleteEredes,
  dailyEnergy,
  energyMeters,
  eredesSummary,
  importEredes,
  quarterEnergy,
  type DayBounds,
} from '../repo/eredes';
import { rangeQuery, type AppEnv, type RouteContext } from './context';

export const MAX_IMPORT_QUARTERS = 3000;

export const MAX_IMPORT_BYTES = 256 * 1024;

// 13 months before the current one, plus the current one (src/app/household-energy.ts).
export const MAX_ENERGY_DAYS = 430;

/** Energy of a quarter hour: up to 41,4 kVA for 15 min is 10 350 Wh; more is not a reading. */
const MAX_QUARTER_WH = 20_000;

const ImportBody = z.object({
  quarters: z
    .array(
      z.tuple([
        z.number().int().min(946_684_800).multipleOf(900),
        z.number().int().min(0).max(MAX_QUARTER_WH),
        z.union([z.literal(0), z.literal(1)]),
      ]),
    )
    .min(1)
    .max(MAX_IMPORT_QUARTERS),
});

const EnergyQuery = rangeQuery(MAX_ENERGY_DAYS).and(
  z.object({ meter: z.string().regex(/^(?:eredes|[^:]{1,64}:[0-3])$/) }),
);

export function energyRoutes(
  app: Hono<AppEnv>,
  { config, now, requireUser, body }: RouteContext,
): void {
  app.post('/v1/import/eredes', requireUser, async (c) => {
    if (Number(c.req.header('Content-Length') ?? 0) > MAX_IMPORT_BYTES) {
      return c.json({ error: 'too_large' }, 413);
    }
    const parsed = await body(c, ImportBody);
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    const { quarters } = parsed.data;
    let first = Infinity;
    let last = -Infinity;
    for (const [ts] of quarters) {
      first = Math.min(first, ts);
      last = Math.max(last, ts);
    }
    // Nothing from the future, and a batch spans about a month.
    if (last > now() || last - first > (MAX_IMPORT_QUARTERS + 96) * 900) {
      return c.json({ error: 'invalid_request' }, 400);
    }
    const days: DayBounds[] = [];
    for (let day = lisbonDate(first); day <= lisbonDate(last); day = nextDate(day)) {
      days.push([day, startOfLisbonDay(day), startOfLisbonDay(nextDate(day))]);
    }
    const written = await importEredes(config.sql, c.get('user').householdId, quarters, days);
    return c.json({ written });
  });

  app.get('/v1/import/eredes', requireUser, async (c) =>
    c.json(await eredesSummary(config.sql, c.get('user').householdId)),
  );

  app.delete('/v1/import/eredes', requireUser, async (c) => {
    await deleteEredes(config.sql, c.get('user').householdId);
    return c.body(null, 204);
  });

  app.get('/v1/energy', requireUser, async (c) => {
    const parsed = rangeQuery(MAX_ENERGY_DAYS).safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    const { from, to } = parsed.data;
    // The Lisbon days that overlap [from, to).
    const meters = await energyMeters(
      config.sql,
      c.get('user').householdId,
      lisbonDate(from),
      lisbonDate(to - 1),
    );
    return c.json({ meters });
  });

  app.get('/v1/energy/days', requireUser, async (c) => {
    const parsed = EnergyQuery.safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    const { meter, from, to } = parsed.data;
    const days = await dailyEnergy(
      config.sql,
      c.get('user').householdId,
      meter,
      lisbonDate(from),
      lisbonDate(to - 1),
    );
    return c.json({ days });
  });

  app.get('/v1/energy/quarters', requireUser, async (c) => {
    const parsed = EnergyQuery.safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    const { meter, from, to } = parsed.data;
    const records = await quarterEnergy(config.sql, c.get('user').householdId, meter, from, to);
    c.header('Content-Type', 'application/octet-stream');
    return c.body(records.buffer as ArrayBuffer);
  });
}
