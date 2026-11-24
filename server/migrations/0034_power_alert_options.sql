-- SPDX-License-Identifier: AGPL-3.0-or-later
-- The power alerts (docs/alerts.md), chosen by each device:
-- - alert_power_pct: the power alert at 100 % or 120 % (the meter starts
--   counting) of the contracted power; 120 as before.
-- - alert_tier_trip / alert_tier_va: another tier, and whether to say when the
--   power would have been cut at it (the meter's curve over the seconds).
ALTER TABLE push_subscriptions ADD COLUMN alert_power_pct INTEGER NOT NULL DEFAULT 120
  CHECK (alert_power_pct IN (100, 120));
ALTER TABLE push_subscriptions ADD COLUMN alert_tier_trip INTEGER NOT NULL DEFAULT 0
  CHECK (alert_tier_trip IN (0, 1));
ALTER TABLE push_subscriptions ADD COLUMN alert_tier_va INTEGER CHECK (alert_tier_va > 0);

-- alert_state's kinds are checked: the table again, with the new kind.
CREATE TABLE alert_state_new (
  household_id TEXT NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('stale', 'power', 'database', 'cheapHours',
    'eredesImport', 'tariffReview', 'budget', 'unusualDay', 'backup', 'tierTrip')),
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
