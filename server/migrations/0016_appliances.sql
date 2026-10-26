-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Naming appliances (Phase 8.3): what the user called a group of cycles, or a
-- calibration, and the descriptor the browser classifies cycles with
-- (src/nilm/appliances.ts). Kept here so every device signed in knows them.
CREATE TABLE appliances (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  -- Power of its cycles at 230 V, W.
  power_w INTEGER NOT NULL,
  -- Measured power of each state, W, as a JSON array of integers.
  states_w TEXT NOT NULL,
  pulsing INTEGER NOT NULL CHECK (pulsing IN (0, 1)),
  created_at INTEGER NOT NULL
);
CREATE INDEX appliances_household ON appliances (household_id);
