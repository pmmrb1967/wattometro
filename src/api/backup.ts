// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Calls to the project's API, same-origin under /v1; every response is
 * validated with zod. The household copy (server/src/routes/backup.ts).
 */
import { z } from 'zod';
import { remindDaysSchema, type RemindDays, type Row, type Section } from '../backup/format';
import { type Failure, failure, int, send } from './client';

const BackupInfo = z.object({
  lastAt: int.nullable(),
  remindDays: remindDaysSchema,
  estimateRows: int,
  rowsReadLimit: int,
});
export type BackupInfo = z.infer<typeof BackupInfo>;

/** The server read (or wrote) enough today: go on after `retryAt` (midnight UTC). */
export type Busy = { ok: false; reason: 'busy'; retryAt: number };
const BusyBody = z.object({ error: z.literal('busy'), retryAt: int });

async function busy(response: Response | null): Promise<Busy | null> {
  if (response?.status !== 503) return null;
  const parsed = BusyBody.safeParse(
    await response
      .clone()
      .json()
      .catch(() => null),
  );
  return parsed.success ? { ok: false, reason: 'busy', retryAt: parsed.data.retryAt } : null;
}

export async function fetchBackupInfo(): Promise<{ ok: true; info: BackupInfo } | Failure> {
  const response = await send('GET', '/v1/backup');
  if (response?.ok) return { ok: true, info: BackupInfo.parse(await response.json()) };
  return failure(response, []);
}

export async function saveBackupReminder(days: RemindDays): Promise<{ ok: true } | Failure> {
  const response = await send('PUT', '/v1/backup/reminder', { days });
  if (response?.ok) return { ok: true };
  return failure(response, [400]);
}

/** 'invalid': not the account's password. */
export async function checkBackupPassword(password: string): Promise<{ ok: true } | Failure> {
  const response = await send('POST', '/v1/backup/password', { password });
  if (response?.ok) return { ok: true };
  return failure(response, [400, 403]);
}

const PageBody = z.object({
  rows: z.array(z.array(z.union([z.string(), z.number(), z.null()]))),
  next: z.array(z.union([z.string(), z.number()])).nullable(),
});
export type ExportPage = z.infer<typeof PageBody>;

export async function fetchExportPage(
  section: Section,
  cursor: ExportPage['next'],
): Promise<{ ok: true; page: ExportPage } | Busy | Failure> {
  const query = new URLSearchParams({ section });
  if (cursor) query.set('cursor', JSON.stringify(cursor));
  const response = await send('GET', `/v1/backup/export?${query}`);
  if (response?.ok) return { ok: true, page: PageBody.parse(await response.json()) };
  return (await busy(response)) ?? failure(response, [400]);
}

export async function recordBackupDone(): Promise<{ ok: true; lastAt: number } | Failure> {
  const response = await send('POST', '/v1/backup/done');
  if (response?.ok) {
    return { ok: true, lastAt: z.object({ lastAt: int }).parse(await response.json()).lastAt };
  }
  return failure(response, []);
}

export async function sendRestoreRows(
  section: Section,
  rows: readonly Row[],
): Promise<{ ok: true; written: number } | Busy | Failure> {
  const response = await send('POST', '/v1/backup/restore', { section, rows });
  if (response?.ok) {
    return { ok: true, written: z.object({ written: int }).parse(await response.json()).written };
  }
  return (await busy(response)) ?? failure(response, [400, 413]);
}
