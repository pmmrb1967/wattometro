-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Tomorrow's market prices (docs/omie.md): the Cron reads the OMIE file of the
-- next day and keeps the last days, for "Tarifários" and the cheap hours alert.
-- Public market data, the same for every household: no household_id.
CREATE TABLE omie_days (
  -- The OMIE day (CET), YYYY-MM-DD.
  day TEXT PRIMARY KEY,
  -- Start of the first period (epoch seconds) and seconds per period (900).
  start INTEGER NOT NULL,
  step INTEGER NOT NULL CHECK (step IN (900, 3600)),
  -- JSON array of integer prices, cents per MWh.
  prices TEXT NOT NULL,
  fetched_at INTEGER NOT NULL
) WITHOUT ROWID;

-- The alert with tomorrow's cheapest and dearest hours: off unless asked for.
ALTER TABLE push_subscriptions ADD COLUMN alert_cheap_hours INTEGER NOT NULL DEFAULT 0
  CHECK (alert_cheap_hours IN (0, 1));

-- alert_state's kinds are checked: the table again, with the new kind.
CREATE TABLE alert_state_new (
  household_id TEXT NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('stale', 'power', 'database', 'cheapHours')),
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
