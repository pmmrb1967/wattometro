-- SPDX-License-Identifier: AGPL-3.0-or-later
-- The household's electricity contract over time (src/domain/tariff.ts).
-- Prices WITHOUT VAT in integer micro-euros (1 € = 1 000 000); power in VA.
-- A contract applies from valid_from (Lisbon day) until the next one starts.
CREATE TABLE tariffs (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  valid_from TEXT NOT NULL,
  supplier TEXT,
  power_va INTEGER NOT NULL,
  option TEXT NOT NULL CHECK (option IN ('simple', 'bi', 'tri')),
  cycle TEXT NOT NULL CHECK (cycle IN ('daily', 'weekly')),
  -- ERSE map of time-of-use periods (docs/time-cycles.md).
  periods_map TEXT NOT NULL CHECK (periods_map IN ('pre-2027', '2027')),
  fixed_per_day INTEGER NOT NULL,
  -- Energy per kWh; only the periods of the option are filled.
  price_simple INTEGER,
  price_off_empty INTEGER,
  price_empty INTEGER,
  price_full INTEGER,
  price_peak INTEGER,
  iec_per_kwh INTEGER NOT NULL,
  cav_per_month INTEGER NOT NULL,
  dgeg_per_month INTEGER NOT NULL,
  large_family INTEGER NOT NULL CHECK (large_family IN (0, 1)),
  created_at INTEGER NOT NULL,
  UNIQUE (household_id, valid_from)
);
