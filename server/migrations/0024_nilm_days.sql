-- SPDX-License-Identifier: AGPL-3.0-or-later
-- The cycles the browser found in each day's per-second values (Phase 8.1,
-- src/nilm/stored.ts): kept after readings_1s expires (90 days), so the
-- appliances keep their history, and shared between the household's devices.
-- No names: the appliances are matched on top, as they are named. `data` is
-- the browser's compressed encoding, at `version` of the detection; a day is
-- replaced when it is worked out again (idempotent by day).
CREATE TABLE nilm_days (
  household_id TEXT NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  meter TEXT NOT NULL,
  day TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  minutes INTEGER NOT NULL CHECK (minutes >= 0),
  data BLOB NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (household_id, meter, day)
) WITHOUT ROWID;
