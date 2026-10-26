-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Alerts by Web Push (Phase 4, docs/alerts.md): the devices that asked for them
-- (one row per browser subscription) and, per household, the state of each alert,
-- so a condition that lasts is announced once.
CREATE TABLE push_subscriptions (
  -- The push service's URL for this browser (server/src/webpush.ts accepts only theirs).
  endpoint TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- The browser's keys for the encryption (RFC 8291), base64url.
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  -- Which alerts this device wants (1/0).
  alert_stale INTEGER NOT NULL DEFAULT 1 CHECK (alert_stale IN (0, 1)),
  alert_power INTEGER NOT NULL DEFAULT 1 CHECK (alert_power IN (0, 1)),
  alert_database INTEGER NOT NULL DEFAULT 1 CHECK (alert_database IN (0, 1)),
  created_at INTEGER NOT NULL
);
CREATE INDEX push_subscriptions_household ON push_subscriptions (household_id);

CREATE TABLE alert_state (
  household_id TEXT NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('stale', 'power', 'database')),
  -- The condition holds now (stale: no minutes; database: past the share of the limit).
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1)),
  -- Epoch seconds: when it began; how far the minutes were looked at (power); last notification.
  since INTEGER,
  checked_until INTEGER,
  sent_at INTEGER,
  PRIMARY KEY (household_id, kind)
) WITHOUT ROWID;
