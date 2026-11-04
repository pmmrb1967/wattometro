// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Calls to the project's API, same-origin under /v1; every response is
 * validated with zod. What every call shares: one way to send (the demonstration and the local
 * mode answer in the browser) and one way to read a failure.
 */
import { z } from 'zod';
import { isDemo } from '../demo/mode';
import { demoResponse } from '../demo/server';
import { isLocal } from '../local/mode';
import { localResponse } from '../local/server';

/** Reasons a request can fail that the user can act on. */
export type Failure =
  | { ok: false; reason: 'invalid' | 'unavailable' | 'unauthenticated' }
  /** Not possible in the demonstration (the account and devices stay as they are). */
  | { ok: false; reason: 'demo' }
  | { ok: false; reason: 'locked'; retryAfter: number };

const Locked = z.object({ retryAfter: z.number().int() });

export async function send(method: string, path: string, body?: unknown): Promise<Response | null> {
  // The demonstration answers in the browser; nothing goes to the server.
  if (isDemo()) return demoResponse(method, path, body);
  // The local mode too: its household is kept in this browser (src/local/).
  if (isLocal()) return localResponse(method, path, body);
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
export async function failure(
  response: Response | null,
  invalidStatuses: number[],
): Promise<Failure> {
  if (!response) return { ok: false, reason: 'unavailable' };
  if (response.status === 409 && isDemo()) return { ok: false, reason: 'demo' };
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

export const int = z.number().int();
