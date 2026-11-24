-- SPDX-License-Identifier: AGPL-3.0-or-later
-- The household copy made in the app (docs/backup.md): when the last one was
-- saved and after how many days to remind (0 = never). No row: no copy yet,
-- the default reminder.
CREATE TABLE household_backup (
  household_id TEXT PRIMARY KEY REFERENCES households (id) ON DELETE CASCADE,
  last_at INTEGER,
  remind_days INTEGER NOT NULL DEFAULT 7 CHECK (remind_days IN (0, 7, 15, 30)),
  updated_at INTEGER NOT NULL
) WITHOUT ROWID;

-- The 'backup' alert was the administrator's (pnpm db:backup); now each
-- household's own copy: what it remembered no longer applies.
DELETE FROM alert_state WHERE kind = 'backup';
