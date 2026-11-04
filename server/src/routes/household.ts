// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The household's name, locality, budget and installation.
 *
 *   PUT  /v1/household         {name} → Me
 *   GET  /v1/household/location → {location: {name, latitudeCdeg, longitudeCdeg} | null}
 *   PUT  /v1/household/location {location: … | null} → 204 (the locality, for the weather;
 *                              hundredths of a degree, docs/open-meteo.md)
 *   GET  /v1/household/installation → {installation: Installation} (src/domain/installation.ts;
 *                              every answer null until saved)
 *   PUT  /v1/household/installation {installation} → 204
 *   GET  /v1/household/budget → {budget: {cents, whPerDay} | null} (src/domain/budget.ts)
 *   PUT  /v1/household/budget {budget: … | null} → 204
 */
import type { Hono } from 'hono';
import { z } from 'zod';
import { budgetSchema } from '../../../src/domain/budget';
import { locationBodySchema } from '../../../src/domain/location';
import { installationSchema } from '../../../src/domain/installation';
import {
  getHouseholdBudget,
  getHouseholdInstallation,
  getHouseholdLocation,
  renameHousehold,
  setHouseholdBudget,
  setHouseholdInstallation,
  setHouseholdLocation,
} from '../repo/households';
import { type AppEnv, type RouteContext } from './context';

const BudgetBody = z.object({ budget: budgetSchema.nullable() });

export const MAX_HOUSEHOLD_NAME = 60;

const HouseholdBody = z.object({ name: z.string().trim().min(1).max(MAX_HOUSEHOLD_NAME) });

const LocationBody = locationBodySchema;

const InstallationBody = z.object({ installation: installationSchema });

export function householdRoutes(
  app: Hono<AppEnv>,
  { config, now, requireUser, body, me }: RouteContext,
): void {
  app.put('/v1/household', requireUser, async (c) => {
    const parsed = await body(c, HouseholdBody);
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    const user = c.get('user');
    await renameHousehold(config.sql, user.householdId, parsed.data.name);
    return c.json(await me(user));
  });

  app.get('/v1/household/location', requireUser, async (c) =>
    c.json({ location: await getHouseholdLocation(config.sql, c.get('user').householdId) }),
  );

  app.put('/v1/household/location', requireUser, async (c) => {
    const parsed = await body(c, LocationBody);
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    await setHouseholdLocation(config.sql, c.get('user').householdId, parsed.data.location);
    return c.body(null, 204);
  });

  app.get('/v1/household/budget', requireUser, async (c) =>
    c.json({ budget: await getHouseholdBudget(config.sql, c.get('user').householdId) }),
  );

  app.put('/v1/household/budget', requireUser, async (c) => {
    const parsed = await body(c, BudgetBody);
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    await setHouseholdBudget(config.sql, c.get('user').householdId, parsed.data.budget, now());
    return c.body(null, 204);
  });

  app.get('/v1/household/installation', requireUser, async (c) =>
    c.json({
      installation: await getHouseholdInstallation(config.sql, c.get('user').householdId),
    }),
  );

  app.put('/v1/household/installation', requireUser, async (c) => {
    const parsed = await body(c, InstallationBody);
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    const { householdId } = c.get('user');
    await setHouseholdInstallation(config.sql, householdId, parsed.data.installation, now());
    return c.body(null, 204);
  });
}
