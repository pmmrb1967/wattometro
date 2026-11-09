// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * What stays on, and the equipment register (docs/equipment.md).
 *
 *   GET  /v1/always-on         → {items: [{id, label, quantity, powerW, measured, equipmentId, createdAt}]}
 *                                (an item named as an equipment, any case, is linked and takes its name)
 *   POST /v1/always-on         {label, quantity, powerW, measured} → 201 {item}; 409 too_many
 *   PUT  /v1/always-on/:id     {label, quantity, powerW, measured} → 204; 404
 *   DELETE /v1/always-on/:id   → 204
 *   GET  /v1/equipment         → {items: Equipment[]} (src/domain/equipment.ts), by name
 *   POST /v1/equipment         EquipmentInput → 201 {item}; 409 too_many | name_taken
 *   PUT  /v1/equipment/:id     EquipmentInput → 204; 404; 409 name_taken. A new name renames the
 *                              linked appliances and their calibrations (repo/equipment.ts)
 *   POST /v1/equipment/:id/link {labels} → 204: the appliances of those names (any case) are
 *                              linked and take its name; 404
 *   DELETE /v1/equipment/:id   → 204; the linked appliances stay, unlinked
 */
import type { Hono } from 'hono';
import { z } from 'zod';
import { createAlwaysOn, deleteAlwaysOn, listAlwaysOn, updateAlwaysOn } from '../repo/always-on';
import {
  createEquipment,
  deleteEquipment,
  linkEquipment,
  listEquipment,
  updateEquipment,
} from '../repo/equipment';
import { equipmentInputSchema, sendsEstimate } from '../../../src/domain/equipment';
import { ApplianceLabel, type AppEnv, type RouteContext } from './context';

const AlwaysOnBody = z
  .object({
    label: ApplianceLabel,
    quantity: z.number().int().min(1).max(99),
    powerW: z.number().int().min(1).max(5000).nullable(),
    measured: z.boolean(),
  })
  .refine(({ powerW, measured }) => powerW !== null || !measured);

const EquipmentLinkBody = z.object({
  labels: z.array(z.string().trim().min(1).max(60)).min(1).max(20),
});

export function equipmentRoutes(
  app: Hono<AppEnv>,
  { config, now, requireUser, body }: RouteContext,
): void {
  // What the household says stays on (the card "Consumo base").
  app.get('/v1/always-on', requireUser, async (c) =>
    c.json({ items: await listAlwaysOn(config.sql, c.get('user').householdId) }),
  );

  app.post('/v1/always-on', requireUser, async (c) => {
    const parsed = await body(c, AlwaysOnBody);
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    const item = await createAlwaysOn(config.sql, c.get('user').householdId, parsed.data, now());
    if (!item) return c.json({ error: 'too_many' }, 409);
    return c.json({ item }, 201);
  });

  app.put('/v1/always-on/:id', requireUser, async (c) => {
    const parsed = await body(c, AlwaysOnBody);
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    const updated = await updateAlwaysOn(
      config.sql,
      c.get('user').householdId,
      c.req.param('id'),
      parsed.data,
    );
    return updated ? c.body(null, 204) : c.json({ error: 'not_found' }, 404);
  });

  app.delete('/v1/always-on/:id', requireUser, async (c) => {
    await deleteAlwaysOn(config.sql, c.get('user').householdId, c.req.param('id'));
    return c.body(null, 204);
  });

  app.get('/v1/equipment', requireUser, async (c) =>
    c.json({ items: await listEquipment(config.sql, c.get('user').householdId) }),
  );

  app.post('/v1/equipment', requireUser, async (c) => {
    const parsed = await body(c, equipmentInputSchema);
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    const item = await createEquipment(config.sql, c.get('user').householdId, parsed.data, now());
    if (typeof item === 'string') return c.json({ error: item }, 409);
    return c.json({ item }, 201);
  });

  app.put('/v1/equipment/:id', requireUser, async (c) => {
    const parsed = await body(c, equipmentInputSchema);
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    const outcome = await updateEquipment(
      config.sql,
      c.get('user').householdId,
      c.req.param('id'),
      parsed.data,
      sendsEstimate(await c.req.json<unknown>()),
    );
    if (outcome === 'name_taken') return c.json({ error: outcome }, 409);
    return outcome === 'ok' ? c.body(null, 204) : c.json({ error: 'not_found' }, 404);
  });

  app.post('/v1/equipment/:id/link', requireUser, async (c) => {
    const parsed = await body(c, EquipmentLinkBody);
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    const found = await linkEquipment(
      config.sql,
      c.get('user').householdId,
      c.req.param('id'),
      parsed.data.labels,
    );
    return found ? c.body(null, 204) : c.json({ error: 'not_found' }, 404);
  });

  app.delete('/v1/equipment/:id', requireUser, async (c) => {
    await deleteEquipment(config.sql, c.get('user').householdId, c.req.param('id'));
    return c.body(null, 204);
  });
}
