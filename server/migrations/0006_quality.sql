-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Power quality (Phase 5): docs/voltage.md.

-- ERSE quality-of-service zone (A, B or C), chosen by the user; NULL until then.
ALTER TABLE households ADD COLUMN quality_zone TEXT CHECK (quality_zone IN ('A', 'B', 'C'));

-- One row per Shelly boot (script 0.2.0+ sends the boot time). A Shelly is powered
-- by the mains, so a boot after a gap in its minutes marks the end of an outage.
-- start_at: end of the last minute stored before the boot (NULL: no earlier minute,
-- e.g. the first boot); excluded: the user said it does not count (e.g. a firmware update).
CREATE TABLE outages (
  device_id TEXT NOT NULL REFERENCES devices (id) ON DELETE CASCADE,
  boot_at INTEGER NOT NULL,
  household_id TEXT NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  start_at INTEGER,
  excluded INTEGER NOT NULL DEFAULT 0 CHECK (excluded IN (0, 1)),
  PRIMARY KEY (device_id, boot_at)
) WITHOUT ROWID;

CREATE INDEX outages_household_boot ON outages (household_id, boot_at);

-- Voltage per 10 minutes (NP EN 50160 evaluates 10-minute values), filled by the Cron.
-- avg: mean of the minutes' averages; min/max: extremes of the minutes.
CREATE TABLE voltage_10m (
  household_id TEXT NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  meter TEXT NOT NULL,
  ts INTEGER NOT NULL,
  minutes INTEGER NOT NULL,
  voltage_avg_dv INTEGER NOT NULL,
  voltage_min_dv INTEGER NOT NULL,
  voltage_max_dv INTEGER NOT NULL,
  PRIMARY KEY (household_id, meter, ts)
) WITHOUT ROWID;
