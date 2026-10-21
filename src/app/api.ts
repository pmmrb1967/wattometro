// SPDX-License-Identifier: AGPL-3.0-or-later
/** Calls to the project's API, same-origin under /v1. Every response is validated with zod. */
import { z } from 'zod';

const Health = z.object({ status: z.enum(['ok', 'degraded']), database: z.boolean() });
export type Health = z.infer<typeof Health>;

const Me = z.object({ email: z.string(), householdId: z.string(), householdName: z.string() });
export type Me = z.infer<typeof Me>;

/** Reasons a request can fail that the user can act on. */
export type Failure =
  | { ok: false; reason: 'invalid' | 'unavailable' | 'unauthenticated' }
  | { ok: false; reason: 'locked'; retryAfter: number };

const Locked = z.object({ retryAfter: z.number().int() });

async function send(method: string, path: string, body?: unknown): Promise<Response | null> {
  try {
    return await fetch(path, {
      method,
      ...(body !== undefined
        ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
        : {}),
    });
  } catch {
    return null;
  }
}

/** Maps an unsuccessful response; `invalidStatuses` are the user's mistakes for this call. */
async function failure(response: Response | null, invalidStatuses: number[]): Promise<Failure> {
  if (!response) return { ok: false, reason: 'unavailable' };
  if (invalidStatuses.includes(response.status)) return { ok: false, reason: 'invalid' };
  if (response.status === 401) return { ok: false, reason: 'unauthenticated' };
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

export async function login(
  email: string,
  password: string,
): Promise<{ ok: true; me: Me } | Failure> {
  const response = await send('POST', '/v1/auth/login', { email, password });
  if (response?.ok) return { ok: true, me: Me.parse(await response.json()) };
  return failure(response, [400, 401]);
}

export async function logout(): Promise<void> {
  await send('POST', '/v1/auth/logout');
}

/** 'invalid' means the current password is wrong. */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: true } | Failure> {
  const response = await send('POST', '/v1/account/password', { currentPassword, newPassword });
  if (response?.ok) return { ok: true };
  return failure(response, [403]);
}

export async function renameHousehold(name: string): Promise<{ ok: true; me: Me } | Failure> {
  const response = await send('PUT', '/v1/household', { name });
  if (response?.ok) return { ok: true, me: Me.parse(await response.json()) };
  return failure(response, [400]);
}
