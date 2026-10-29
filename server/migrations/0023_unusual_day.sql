-- SPDX-License-Identifier: AGPL-3.0-or-later
-- A push alert for an unusual day (docs/alerts.md): yesterday far from the
-- usual for its kind of day, as "Ontem, fora do habitual" in the app. Off
-- unless asked for.
ALTER TABLE push_subscriptions ADD COLUMN alert_unusual_day INTEGER NOT NULL DEFAULT 0
  CHECK (alert_unusual_day IN (0, 1));

-- alert_state's kinds are checked: the table again, with the new kind.
CREATE TABLE alert_state_new (
  household_id TEXT NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('stale', 'power', 'database', 'cheapHours',
    'eredesImport', 'tariffReview', 'budget', 'unusualDay')),
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1)),
  since INTEGER,
  checked_until INTEGER,
  sent_at INTEGER,
  PRIMARY KEY (household_id, kind)
) WITHOUT ROWID;
INSERT INTO alert_state_new SELECT household_id, kind, active, since, checked_until, sent_at
  FROM alert_state;
DROP TABLE alert_state;
ALTER TABLE alert_state_new RENAME TO alert_state;
