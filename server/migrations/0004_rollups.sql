-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Aggregates kept indefinitely, filled by the Cron (server/src/rollups.ts).
-- meter: 'device_id:channel' for a Shelly; 'eredes' for the E-Redes file (Phase 2).

-- Quarter hours aligned with E-Redes (ts = start, UTC epoch seconds, multiple of 900).
CREATE TABLE readings_15m (
  household_id TEXT NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  meter TEXT NOT NULL,
  ts INTEGER NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('shelly', 'eredes')),
  -- Minutes with data (Shelly); NULL for E-Redes.
  minutes INTEGER,
  energy_wh INTEGER NOT NULL,
  -- Highest one-second power (Shelly); NULL for E-Redes, which only gives energy.
  power_max_w INTEGER,
  voltage_min_dv INTEGER,
  voltage_max_dv INTEGER,
  PRIMARY KEY (household_id, meter, ts)
) WITHOUT ROWID;

-- Lisbon calendar days ('YYYY-MM-DD'; 23 h or 25 h when the clocks change).
-- Energy per time-of-use period and the baseload join in Phase 3.
CREATE TABLE daily (
  household_id TEXT NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  meter TEXT NOT NULL,
  day TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('shelly', 'eredes')),
  minutes INTEGER,
  energy_wh INTEGER NOT NULL,
  power_max_w INTEGER,
  voltage_min_dv INTEGER,
  voltage_max_dv INTEGER,
  PRIMARY KEY (household_id, meter, day)
) WITHOUT ROWID;

-- Progress of the Cron jobs (e.g. how far the rollups have gone).
CREATE TABLE maintenance_state (
  name TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
