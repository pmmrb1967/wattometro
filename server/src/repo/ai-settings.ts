// SPDX-License-Identifier: AGPL-3.0-or-later
/** user_ai_settings: one row per user, the key sealed (secret-box.ts). By primary key only. */
import type { Sql } from '../db';

export interface StoredAiSettings {
  keySealed: string;
  model: string;
  autoSend: boolean;
  updatedAt: number;
}

export async function getAiSettings(
  sql: Sql,
  user: { id: string },
): Promise<StoredAiSettings | null> {
  const row = await sql.first<{
    key_sealed: string;
    model: string;
    auto_send: number;
    updated_at: number;
  }>(
    'SELECT key_sealed, model, auto_send, updated_at FROM user_ai_settings WHERE user_id = ?',
    user.id,
  );
  return row
    ? {
        keySealed: row.key_sealed,
        model: row.model,
        autoSend: row.auto_send === 1,
        updatedAt: row.updated_at,
      }
    : null;
}

export async function putAiSettings(
  sql: Sql,
  user: { id: string; householdId: string },
  settings: StoredAiSettings,
): Promise<void> {
  await sql.run(
    `INSERT INTO user_ai_settings (user_id, household_id, key_sealed, model, auto_send, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET key_sealed = excluded.key_sealed,
       model = excluded.model, auto_send = excluded.auto_send, updated_at = excluded.updated_at`,
    user.id,
    user.householdId,
    settings.keySealed,
    settings.model,
    settings.autoSend ? 1 : 0,
    settings.updatedAt,
  );
}

export async function deleteAiSettings(sql: Sql, user: { id: string }): Promise<void> {
  await sql.run('DELETE FROM user_ai_settings WHERE user_id = ?', user.id);
}
