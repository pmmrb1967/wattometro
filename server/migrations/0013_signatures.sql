-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Calibration (Phase 8.2): the user marks when an appliance ran ("liguei a
-- máquina de lavar") and the per-second values of those minutes are copied
-- here from readings_1s, which keeps them for 90 days only. Never purged: they
-- are the house's library of appliance signatures.
CREATE TABLE signatures (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  device_id TEXT NOT NULL REFERENCES devices (id) ON DELETE CASCADE,
  channel INTEGER NOT NULL,
  label TEXT NOT NULL,
  -- What the user marked, epoch seconds; the copied minutes go one minute
  -- beyond each side, so the steps are inside them.
  start_at INTEGER NOT NULL,
  end_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX signatures_household ON signatures (household_id, start_at);

-- The copied minutes, as in readings_1s (docs/readings-1s.md).
CREATE TABLE signature_seconds (
  signature_id TEXT NOT NULL REFERENCES signatures (id) ON DELETE CASCADE,
  ts INTEGER NOT NULL,
  household_id TEXT NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  data BLOB NOT NULL,
  PRIMARY KEY (signature_id, ts)
);
