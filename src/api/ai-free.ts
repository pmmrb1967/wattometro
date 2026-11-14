// SPDX-License-Identifier: AGPL-3.0-or-later
/** The free AI on the project's Worker (server/src/ai-free.ts): one request, and today's quota. */
import { z } from 'zod';
import type { FreeAnswer, FreeRequest } from '../ai/free';
import { AiError } from '../ai/provider';
import { int, send } from './client';

const Answer = z.object({
  content: z.string().nullable(),
  toolCalls: z.array(z.object({ id: z.string(), name: z.string(), arguments: z.string() })),
  finishReason: z.string().nullable(),
  inputTokens: int,
  outputTokens: int,
});

const Status = z.object({ available: z.boolean(), neuronsToday: int, neuronsLimit: int });
export type FreeAiStatus = z.infer<typeof Status>;

const ERRORS: Record<string, AiError['code']> = {
  free_quota: 'free_quota',
  not_configured: 'free_unavailable',
  too_large: 'too_large',
  rate_limited: 'rate_limited',
  invalid_request: 'invalid_output',
};

/** Sends one request; failures as AiError (so the pages say what happened). */
export async function askFreeAi(request: FreeRequest): Promise<FreeAnswer> {
  const response = await send('POST', '/v1/ai/free', request);
  if (!response) throw new AiError('offline');
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (response.status === 401) throw new AiError('free_unavailable');
    throw new AiError(
      ERRORS[body?.error ?? ''] ?? (response.status === 413 ? 'too_large' : 'unavailable'),
    );
  }
  const parsed = Answer.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new AiError('invalid_output');
  return parsed.data;
}

/** Today's Neurons against the free limit; null when unknown (offline, no account). */
export async function fetchFreeAiStatus(): Promise<FreeAiStatus | null> {
  const response = await send('GET', '/v1/ai/free/status');
  if (!response?.ok) return null;
  const parsed = Status.safeParse(await response.json().catch(() => null));
  return parsed.success ? parsed.data : null;
}
