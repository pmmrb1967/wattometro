// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The administrator's database copies (pnpm db:backup, docs/admin.md): shared
 * by the Cron's alert (server/src/alerts.ts) and the panel (src/app/AdminStats.tsx).
 */

/** The copy is late past this: a weekly copy, and a day's grace. */
export const BACKUP_STALE_DAYS = 8;
