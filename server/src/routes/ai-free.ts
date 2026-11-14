// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The free AI (ai-free.ts, docs/ai.md), for signed-in users:
 *
 *   GET  /v1/ai/free/status  → {available, neuronsToday, neuronsLimit}
 *   POST /v1/ai/free         {task, messages, tools?, schema?, maxTokens}
 *                            → {content, toolCalls, finishReason, inputTokens, outputTokens}
 *        400 invalid_request; 413 too_large; 429 rate_limited; 502 ai_failed;
 *        503 not_configured (no Workers AI binding) or free_quota (today's Neurons spent)
 */
import type { Hono } from 'hono';
import {
  FREE_NEURONS_CAP,
  FREE_NEURONS_PER_DAY,
  FreeAiError,
  FreeRequest,
  MAX_BODY_BYTES,
  runFreeAi,
} from '../ai-free';
import { addFreeAiUsage, freeAiOn, utcDay } from '../repo/usage';
import type { AppEnv, RouteContext } from './context';

export function freeAiRoutes(
  app: Hono<AppEnv>,
  { config, now, requireUser, body }: RouteContext,
): void {
  app.get('/v1/ai/free/status', requireUser, async (c) => {
    const used = await freeAiOn(config.sql, utcDay(now()));
    return c.json({
      available: config.ai !== undefined && used.neurons < FREE_NEURONS_CAP,
      neuronsToday: used.neurons,
      neuronsLimit: FREE_NEURONS_PER_DAY,
    });
  });

  app.post('/v1/ai/free', requireUser, async (c) => {
    const ai = config.ai;
    if (!ai) return c.json({ error: 'not_configured' }, 503);
    if (Number(c.req.header('Content-Length') ?? 0) > MAX_BODY_BYTES) {
      return c.json({ error: 'too_large' }, 413);
    }
    const parsed = await body(c, FreeRequest);
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    const day = utcDay(now());
    if ((await freeAiOn(config.sql, day)).neurons >= FREE_NEURONS_CAP) {
      return c.json({ error: 'free_quota' }, 503);
    }
    try {
      const { answer, neurons } = await runFreeAi(ai, parsed.data);
      await addFreeAiUsage(config.sql, day, neurons);
      return c.json(answer);
    } catch (error) {
      if (error instanceof FreeAiError) return c.json({ error: error.message }, error.status);
      throw error;
    }
  });
}
