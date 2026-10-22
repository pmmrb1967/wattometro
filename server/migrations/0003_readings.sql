-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Shelly readings, one row per device, channel and minute (Phase 1).
-- ts is the start of the minute (UTC epoch seconds, a multiple of 60).

-- Reported by the device in every ingest payload; rate_* limit requests per minute.
ALTER TABLE devices ADD COLUMN firmware TEXT;
ALTER TABLE devices ADD COLUMN rate_window INTEGER;
ALTER TABLE devices ADD COLUMN rate_count INTEGER NOT NULL DEFAULT 0;

-- Integer units (CLAUDE.md, rule 4): Wh, W, decivolts, percent.
CREATE TABLE readings_1m (
  device_id TEXT NOT NULL REFERENCES devices (id) ON DELETE CASCADE,
  channel INTEGER NOT NULL,
  ts INTEGER NOT NULL,
  household_id TEXT NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  -- Seconds of the minute with a reading (1–60); fewer after a reboot or a lost second.
  samples INTEGER NOT NULL,
  -- floor(counter at the end) − floor(counter at the start): minutes add up to the counter.
  energy_wh INTEGER NOT NULL,
  power_avg_w INTEGER NOT NULL,
  power_min_w INTEGER NOT NULL,
  power_max_w INTEGER NOT NULL,
  voltage_min_dv INTEGER NOT NULL,
  voltage_avg_dv INTEGER NOT NULL,
  voltage_max_dv INTEGER NOT NULL,
  -- ΣP / ΣS over the minute, in percent.
  pf_avg_pct INTEGER NOT NULL,
  PRIMARY KEY (device_id, channel, ts)
) WITHOUT ROWID;

CREATE INDEX readings_1m_household_ts ON readings_1m (household_id, ts);

-- Per-second values of one minute, binary format in docs/readings-1s.md (short retention).
CREATE TABLE readings_1s (
  device_id TEXT NOT NULL REFERENCES devices (id) ON DELETE CASCADE,
  channel INTEGER NOT NULL,
  ts INTEGER NOT NULL,
  household_id TEXT NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  data BLOB NOT NULL,
  PRIMARY KEY (device_id, channel, ts)
);

CREATE INDEX readings_1s_household_ts ON readings_1s (household_id, ts);
