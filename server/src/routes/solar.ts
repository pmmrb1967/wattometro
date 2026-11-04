// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Solar panels (docs/pvgis.md): PVGIS refuses browsers, so the Worker asks for the user.
 *
 *   GET  /v1/solar?angle&aspect&loss → application/json, PVGIS's hourly PV series for 1 kWp at
 *                              the household's locality, passed on unread (pvgis.ts,
 *                              docs/pvgis.md); 409 no_location, 502 unavailable
 */
import type { Hono } from 'hono';
import { z } from 'zod';
import { pvgisFetch, pvgisUrl } from '../pvgis';
import { getHouseholdLocation } from '../repo/households';
import { type AppEnv, type RouteContext } from './context';

const SolarQuery = z.object({
  angle: z.coerce.number().int().min(0).max(90),
  aspect: z.coerce.number().int().min(-180).max(180),
  loss: z.coerce.number().int().min(0).max(50),
});

export function solarRoutes(app: Hono<AppEnv>, { config, requireUser }: RouteContext): void {
  // Solar panels (docs/pvgis.md): PVGIS refuses browsers, so the Worker asks for the user.
  app.get('/v1/solar', requireUser, async (c) => {
    const parsed = SolarQuery.safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    const location = await getHouseholdLocation(config.sql, c.get('user').householdId);
    if (!location) return c.json({ error: 'no_location' }, 409);
    const upstream = await (config.pvgisFetcher ?? pvgisFetch)(pvgisUrl(location, parsed.data))
      .then((response) => (response.ok && response.body ? response : null))
      .catch(() => null);
    if (!upstream) return c.json({ error: 'unavailable' }, 502);
    return new Response(upstream.body, {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=86400' },
    });
  });
}
