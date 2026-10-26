-- SPDX-License-Identifier: AGPL-3.0-or-later
-- The user's AI settings, so every device they sign in on has them (as in
-- ifanalysis). The key is never stored in clear: key_sealed is AES-GCM with a
-- key derived from the Worker secret AI_KEY_SECRET (server/src/secret-box.ts).
CREATE TABLE user_ai_settings (
  user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  household_id TEXT NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  key_sealed TEXT NOT NULL,
  model TEXT NOT NULL,
  auto_send INTEGER NOT NULL CHECK (auto_send IN (0, 1)),
  updated_at INTEGER NOT NULL
) WITHOUT ROWID;
