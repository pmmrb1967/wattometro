-- SPDX-License-Identifier: AGPL-3.0-or-later
-- What the household says stays on day and night (src/domain/always-on.ts), to
-- set against the baseload measured. The watts are the user's.
CREATE TABLE always_on (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity >= 1),
  -- What each one draws, W; NULL when not known.
  power_w INTEGER,
  -- Read on a meter (1), or estimated by the user (0).
  measured INTEGER NOT NULL CHECK (measured IN (0, 1)),
  created_at INTEGER NOT NULL
);
CREATE INDEX always_on_household ON always_on (household_id);
