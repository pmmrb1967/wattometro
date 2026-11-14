// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Calls to the project's API, same-origin under /v1; every response is
 * validated with zod. The signed-in user, the password, page visits and the administrator's panel.
 */
import { z } from 'zod';
import { isDemo } from '../demo/mode';
import { demoResponse } from '../demo/server';
import { isLocal } from '../local/mode';
import { localResponse } from '../local/server';
import type { VisitPage } from '../lib/pages';
import { type Failure, failure, int, send } from './client';

export const Me = z.object({
  email: z.string(),
  householdId: z.string(),
  householdName: z.string(),
  // Absent from a server older than the app: not an administrator.
  admin: z.boolean().default(false),
});

export type Me = z.infer<typeof Me>;

/** The signed-in user, or null without a valid session. */
export async function fetchMe(signal?: AbortSignal): Promise<Me | null> {
  const response = isDemo()
    ? demoResponse('GET', '/v1/auth/me')
    : isLocal()
      ? await localResponse('GET', '/v1/auth/me')
      : await fetch('/v1/auth/me', { signal });
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

/** One more visit to a page, for the administrator's panel; failures do not matter. */
export async function recordVisit(page: VisitPage): Promise<void> {
  await send('POST', '/v1/visit', { page });
}

const AdminStats = z.object({
  now: int,
  limits: z.object({
    rowsRead: int,
    rowsWritten: int,
    databaseBytes: int,
    // Absent from a server older than the free AI.
    aiNeurons: int.default(10_000),
  }),
  days: z.array(z.object({ day: z.string(), rowsRead: int, rowsWritten: int })),
  /** The free AI per UTC day; null: the server has no Workers AI. */
  freeAi: z
    .array(z.object({ day: z.string(), calls: int, neurons: int }))
    .nullable()
    .default(null),
  databaseBytes: int.nullable(),
  cron: z.object({ rolledUpUntil: int.nullable(), purgedAt: int.nullable() }),
  accounts: z.object({ users: int, households: int, pushDevices: int }),
  devices: z.array(
    z.object({
      model: z.string().nullable(),
      scriptVersion: z.string().nullable(),
      lastSeenAt: int.nullable(),
      minutesToday: int,
      expectedToday: int,
    }),
  ),
  visits: z.object({
    days: int,
    pages: z.array(z.object({ page: z.string(), today: int, total: int })),
  }),
});

export type AdminStats = z.infer<typeof AdminStats>;

/** The server's totals (administrators only; others get 403). */
export async function fetchAdminStats(): Promise<{ ok: true; stats: AdminStats } | Failure> {
  const response = await send('GET', '/v1/admin/stats');
  if (response?.ok) return { ok: true, stats: AdminStats.parse(await response.json()) };
  return failure(response, [403]);
}
