// SPDX-License-Identifier: AGPL-3.0-or-later
/** Calls to the project's API, same-origin under /v1. Every response is validated with zod. */
import { z } from 'zod';

const Health = z.object({ status: z.enum(['ok', 'degraded']), database: z.boolean() });
export type Health = z.infer<typeof Health>;

const Me = z.object({ email: z.string(), householdId: z.string() });
export type Me = z.infer<typeof Me>;

export async function fetchHealth(signal?: AbortSignal): Promise<Health> {
  const response = await fetch('/v1/health', { signal });
  return Health.parse(await response.json());
}

/** The signed-in user, or null without a valid session. */
export async function fetchMe(signal?: AbortSignal): Promise<Me | null> {
  const response = await fetch('/v1/auth/me', { signal });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return Me.parse(await response.json());
}

export type LoginOutcome =
  | { ok: true; me: Me }
  | { ok: false; reason: 'invalid' | 'unavailable' }
  | { ok: false; reason: 'locked'; retryAfter: number };

const Locked = z.object({ retryAfter: z.number().int() });

export async function login(email: string, password: string): Promise<LoginOutcome> {
  let response: Response;
  try {
    response = await fetch('/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
  if (response.ok) return { ok: true, me: Me.parse(await response.json()) };
  if (response.status === 401 || response.status === 400) return { ok: false, reason: 'invalid' };
  if (response.status === 429) {
    const locked = Locked.safeParse(await response.json().catch(() => null));
    return {
      ok: false,
      reason: 'locked',
      retryAfter: locked.success ? locked.data.retryAfter : 900,
    };
  }
  return { ok: false, reason: 'unavailable' };
}

export async function logout(): Promise<void> {
  await fetch('/v1/auth/logout', { method: 'POST' });
}
