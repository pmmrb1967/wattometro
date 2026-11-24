// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The administrator's database copies (pnpm db:backup, docs/admin.md), made by
 * hand: the panel (src/app/AdminStats.tsx) marks the last one past this.
 * The household copies have their own reminder (src/backup/format.ts).
 */

/** The copy is marked old past this. */
export const BACKUP_STALE_DAYS = 8;
