// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Calls to the project's API, same-origin under /v1; every response is
 * validated with zod. The AI settings kept with the account, and the Web Push alerts.
 */
import { z } from 'zod';
import { isDemo } from '../demo/mode';
import { type Failure, failure, send } from './client';

/** The user's AI settings kept in their account (GET /v1/ai-settings): the key opened by the server. */
const AccountAiSettings = z.object({
  apiKey: z.string(),
  model: z.string(),
  autoSend: z.boolean(),
});

export type AccountAiSettings = z.infer<typeof AccountAiSettings>;

/** null: the account has none. "unavailable" also covers a server without AI_KEY_SECRET (503). */
export async function fetchAccountAiSettings(): Promise<
  { ok: true; settings: AccountAiSettings | null } | Failure
> {
  const response = await send('GET', '/v1/ai-settings');
  if (response?.status === 404) return { ok: true, settings: null };
  if (response?.ok) return { ok: true, settings: AccountAiSettings.parse(await response.json()) };
  return failure(response, []);
}

export async function saveAccountAiSettings(
  settings: AccountAiSettings,
): Promise<{ ok: true } | Failure> {
  const response = await send('PUT', '/v1/ai-settings', settings);
  if (response?.ok) return { ok: true };
  return failure(response, [400]);
}

export async function deleteAccountAiSettings(): Promise<{ ok: true } | Failure> {
  const response = await send('DELETE', '/v1/ai-settings');
  if (response?.ok) return { ok: true };
  return failure(response, []);
}

/** Which alerts this browser wants (server/src/alerts.ts). */
const PushAlerts = z.object({
  stale: z.boolean(),
  power: z.boolean(),
  database: z.boolean(),
  cheapHours: z.boolean(),
  eredesImport: z.boolean(),
  tariffReview: z.boolean(),
  budget: z.boolean(),
  // Absent from a server older than migration 0023.
  unusualDay: z.boolean().default(false),
});

export type PushAlerts = z.infer<typeof PushAlerts>;

/** The server's VAPID key; "invalid" when the server has none (503 not_configured). */
export async function fetchPushKey(): Promise<{ ok: true; publicKey: string } | Failure> {
  // No alerts in the demonstration: nothing to subscribe to.
  if (isDemo()) return { ok: false, reason: 'demo' };
  const response = await send('GET', '/v1/push/key');
  if (response?.status === 503) {
    const answer = z.object({ error: z.string() }).safeParse(
      await response
        .clone()
        .json()
        .catch(() => null),
    );
    if (answer.success && answer.data.error === 'not_configured')
      return { ok: false, reason: 'invalid' };
  }
  if (response?.ok) {
    return { ok: true, ...z.object({ publicKey: z.string() }).parse(await response.json()) };
  }
  return failure(response, []);
}

/** null: the server does not know this browser's subscription. */
export async function fetchPushAlerts(
  endpoint: string,
): Promise<{ ok: true; alerts: PushAlerts | null } | Failure> {
  const response = await send(
    'GET',
    `/v1/push/subscription?endpoint=${encodeURIComponent(endpoint)}`,
  );
  if (response?.status === 404) return { ok: true, alerts: null };
  if (response?.ok) {
    return {
      ok: true,
      alerts: z.object({ alerts: PushAlerts }).parse(await response.json()).alerts,
    };
  }
  return failure(response, []);
}

export async function savePushSubscription(subscription: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  alerts: PushAlerts;
}): Promise<{ ok: true } | Failure> {
  const response = await send('PUT', '/v1/push/subscription', subscription);
  if (response?.ok) return { ok: true };
  return failure(response, [400]);
}

export async function deletePushSubscription(endpoint: string): Promise<{ ok: true } | Failure> {
  const response = await send('DELETE', '/v1/push/subscription', { endpoint });
  if (response?.ok) return { ok: true };
  return failure(response, []);
}

/** 502: the push service refused (the browser dropped the subscription). */
export async function sendTestPush(endpoint: string): Promise<{ ok: true } | Failure> {
  const response = await send('POST', '/v1/push/test', { endpoint });
  if (response?.ok) return { ok: true };
  return failure(response, [404, 502]);
}
