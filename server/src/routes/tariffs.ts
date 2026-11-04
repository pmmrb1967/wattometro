// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The household's contracts and the market prices (omie.ts).
 *
 *   GET  /v1/tariffs           → {tariffs: Tariff[]} (oldest first; src/domain/tariff.ts)
 *   POST /v1/tariffs           TariffInput → 201 {tariff}; same validFrom replaces that contract
 *   DELETE /v1/tariffs/:id     → 204
 *   GET  /v1/omie              → {days: [{date, start, step, prices}]}: the market prices of today
 *                              and tomorrow, once published (omie.ts; cents per MWh)
 */
import type { Hono } from 'hono';
import { lisbonDate } from '../../../src/lib/time';
import { tariffInputSchema } from '../../../src/domain/tariff';
import { omieDaysFrom } from '../repo/omie';
import { deleteTariff, listTariffs, saveTariff } from '../repo/tariffs';
import { type AppEnv, type RouteContext } from './context';

export function tariffsRoutes(
  app: Hono<AppEnv>,
  { config, now, requireUser, body }: RouteContext,
): void {
  app.get('/v1/omie', requireUser, async (c) =>
    c.json({ days: await omieDaysFrom(config.sql, lisbonDate(now())) }),
  );

  app.get('/v1/tariffs', requireUser, async (c) =>
    c.json({ tariffs: await listTariffs(config.sql, c.get('user').householdId) }),
  );

  app.post('/v1/tariffs', requireUser, async (c) => {
    const parsed = await body(c, tariffInputSchema);
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    const tariff = await saveTariff(config.sql, c.get('user').householdId, parsed.data, now());
    return c.json({ tariff }, 201);
  });

  app.delete('/v1/tariffs/:id', requireUser, async (c) => {
    await deleteTariff(config.sql, c.get('user').householdId, c.req.param('id'));
    return c.body(null, 204);
  });
}
