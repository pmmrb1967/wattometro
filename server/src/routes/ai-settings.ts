// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The user's AI settings, on every device they sign in on (repo/ai-settings.ts).
 *
 *   GET  /v1/ai-settings       → {apiKey, geminiKey, model, autoSend, updatedAt}; 404 none; 503
 *                              without AI_KEY_SECRET (the keys are sealed in D1: secret-box.ts)
 *   PUT  /v1/ai-settings       {apiKey, geminiKey?, model, autoSend} → 204: a key, or the
 *                              free AI's model (which needs none)
 *   DELETE /v1/ai-settings     → 204 (on every device)
 */
import type { Hono } from 'hono';
import { z } from 'zod';
import { FREE_AI_MODEL } from '../../../src/ai/models';
import { deleteAiSettings, getAiSettings, putAiSettings } from '../repo/ai-settings';
import { MIN_SECRET_LENGTH, open as openSealed, seal } from '../secret-box';
import { type AppEnv, type RouteContext } from './context';

const AiSettingsBody = z
  .object({
    /** Anthropic's ('' for none). */
    apiKey: z.string().trim().max(500),
    geminiKey: z.string().trim().max(500).default(''),
    model: z.string().min(1).max(100),
    autoSend: z.boolean(),
  })
  .refine((settings) => settings.apiKey || settings.geminiKey || settings.model === FREE_AI_MODEL);

export function aiSettingsRoutes(
  app: Hono<AppEnv>,
  { config, now, requireUser, body }: RouteContext,
): void {
  // The user's AI settings, on every device they sign in on (repo/ai-settings.ts).
  const aiSecret = () =>
    config.aiKeySecret && config.aiKeySecret.length >= MIN_SECRET_LENGTH
      ? config.aiKeySecret
      : null;

  app.get('/v1/ai-settings', requireUser, async (c) => {
    const secret = aiSecret();
    if (!secret) return c.json({ error: 'not_configured' }, 503);
    const user = c.get('user');
    const stored = await getAiSettings(config.sql, user);
    const apiKey = stored ? await openSealed(secret, stored.keySealed, user.id) : null;
    if (!stored || apiKey === null) return c.json({ error: 'not_found' }, 404);
    const geminiKey = stored.geminiKeySealed
      ? await openSealed(secret, stored.geminiKeySealed, user.id)
      : '';
    return c.json({
      apiKey,
      geminiKey: geminiKey ?? '',
      model: stored.model,
      autoSend: stored.autoSend,
      updatedAt: stored.updatedAt,
    });
  });

  app.put('/v1/ai-settings', requireUser, async (c) => {
    const secret = aiSecret();
    if (!secret) return c.json({ error: 'not_configured' }, 503);
    const parsed = await body(c, AiSettingsBody);
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    const user = c.get('user');
    await putAiSettings(config.sql, user, {
      keySealed: await seal(secret, parsed.data.apiKey, user.id),
      geminiKeySealed: parsed.data.geminiKey
        ? await seal(secret, parsed.data.geminiKey, user.id)
        : null,
      model: parsed.data.model,
      autoSend: parsed.data.autoSend,
      updatedAt: now(),
    });
    return c.body(null, 204);
  });

  app.delete('/v1/ai-settings', requireUser, async (c) => {
    await deleteAiSettings(config.sql, c.get('user'));
    return c.body(null, 204);
  });
}
