-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Households and their measuring devices (Shelly). Every table with data
-- carries household_id (CLAUDE.md, rule 5). Times are UTC epoch seconds.

CREATE TABLE households (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  -- Shelly model (e.g. "S3EM-002CXCEU"), as reported by the device.
  model TEXT,
  -- Version of shelly/wattometro.js last seen in an ingest payload.
  script_version TEXT,
  -- SHA-256 of the device token (hex); the token itself is never stored.
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER,
  revoked_at INTEGER
);

CREATE INDEX devices_household ON devices (household_id);
