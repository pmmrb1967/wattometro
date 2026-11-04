// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Web Push alerts (alerts.ts): this browser's subscription and which alerts it wants.
 *
 *   GET  /v1/push/key          → {publicKey} (VAPID, for the browser's subscription); 503 none
 *   GET  /v1/push/subscription?endpoint → {alerts: {stale, power, database, cheapHours,
 *                              eredesImport, tariffReview, budget}}; 404 not this user's
 *   PUT  /v1/push/subscription {endpoint, keys: {p256dh, auth}, alerts} → 204 (a push service's
 *                              endpoint only: webpush.ts, isPushEndpoint)
 *   DELETE /v1/push/subscription {endpoint} → 204
 *   POST /v1/push/test         {endpoint} → 204 sent; 404; 502 the push service refused
 */
import type { Hono } from 'hono';
import { z } from 'zod';
import { t } from '../../../src/i18n/pt-PT';
import {
  deleteSubscription,
  findSubscription,
  forgetEndpoint,
  saveSubscription,
} from '../repo/push';
import { isPushEndpoint, sendPush } from '../webpush';
import { type AppEnv, type RouteContext } from './context';

const PushAlerts = z.object({
  stale: z.boolean(),
  power: z.boolean(),
  database: z.boolean(),
  // Absent from an app cached before migrations 0019, 0020 and 0023: off.
  cheapHours: z.boolean().default(false),
  eredesImport: z.boolean().default(false),
  tariffReview: z.boolean().default(false),
  budget: z.boolean().default(false),
  unusualDay: z.boolean().default(false),
});

const PushEndpoint = z.string().max(2000).refine(isPushEndpoint);

const PushSubscriptionBody = z.object({
  endpoint: PushEndpoint,
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
  alerts: PushAlerts,
});

const PushEndpointBody = z.object({ endpoint: PushEndpoint });

export function pushRoutes(
  app: Hono<AppEnv>,
  { config, now, requireUser, body }: RouteContext,
): void {
  // Web Push alerts (alerts.ts): this browser's subscription and which alerts it wants.
  app.get('/v1/push/key', requireUser, (c) =>
    config.vapid
      ? c.json({ publicKey: config.vapid.publicKey })
      : c.json({ error: 'not_configured' }, 503),
  );

  app.get('/v1/push/subscription', requireUser, async (c) => {
    const parsed = PushEndpointBody.safeParse({ endpoint: c.req.query('endpoint') });
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    const found = await findSubscription(config.sql, c.get('user'), parsed.data.endpoint);
    return found ? c.json({ alerts: found.alerts }) : c.json({ error: 'not_found' }, 404);
  });

  app.put('/v1/push/subscription', requireUser, async (c) => {
    if (!config.vapid) return c.json({ error: 'not_configured' }, 503);
    const parsed = await body(c, PushSubscriptionBody);
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    const { endpoint, keys, alerts } = parsed.data;
    await saveSubscription(config.sql, c.get('user'), { endpoint, ...keys, alerts }, now());
    return c.body(null, 204);
  });

  app.delete('/v1/push/subscription', requireUser, async (c) => {
    const parsed = await body(c, PushEndpointBody);
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    await deleteSubscription(config.sql, c.get('user'), parsed.data.endpoint);
    return c.body(null, 204);
  });

  app.post('/v1/push/test', requireUser, async (c) => {
    if (!config.vapid) return c.json({ error: 'not_configured' }, 503);
    const parsed = await body(c, PushEndpointBody);
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    const found = await findSubscription(config.sql, c.get('user'), parsed.data.endpoint);
    if (!found) return c.json({ error: 'not_found' }, 404);
    const message = {
      title: t.alerts.testTitle,
      body: t.alerts.testBody,
      tag: 'test',
      url: '/definicoes',
    };
    const result = await sendPush(found, message, config.vapid, now(), config.pushFetcher);
    if (result === 'gone') await forgetEndpoint(config.sql, found.endpoint);
    return result === 'sent' ? c.body(null, 204) : c.json({ error: result }, 502);
  });
}
