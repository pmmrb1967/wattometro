-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Reminders by Web Push (docs/alerts.md): import the E-Redes file again, review
-- the tariff in January and July, the month's budget. Off unless asked for.
ALTER TABLE push_subscriptions ADD COLUMN alert_eredes_import INTEGER NOT NULL DEFAULT 0
  CHECK (alert_eredes_import IN (0, 1));
ALTER TABLE push_subscriptions ADD COLUMN alert_tariff_review INTEGER NOT NULL DEFAULT 0
  CHECK (alert_tariff_review IN (0, 1));
ALTER TABLE push_subscriptions ADD COLUMN alert_budget INTEGER NOT NULL DEFAULT 0
  CHECK (alert_budget IN (0, 1));

-- The month's budget: the euros the user gave and the energy a day they buy,
-- worked out in the browser with the tariff (src/domain/budget.ts).
CREATE TABLE household_budget (
  household_id TEXT PRIMARY KEY REFERENCES households (id) ON DELETE CASCADE,
  cents INTEGER NOT NULL CHECK (cents > 0),
  wh_per_day INTEGER NOT NULL CHECK (wh_per_day > 0),
  updated_at INTEGER NOT NULL
) WITHOUT ROWID;

-- alert_state's kinds are checked: the table again, with the new kinds.
CREATE TABLE alert_state_new (
  household_id TEXT NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('stale', 'power', 'database', 'cheapHours',
    'eredesImport', 'tariffReview', 'budget')),
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
