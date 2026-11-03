-- SPDX-License-Identifier: AGPL-3.0-or-later
-- The house's equipment (src/domain/equipment.ts): what the user says they
-- have, optional, to help name what the Shelly sees. An appliance (a
-- descriptor the browser classifies cycles with) may be linked to one; it then
-- takes the equipment's name.
CREATE TABLE equipment (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  -- The name trimmed and lower-cased in Portuguese (nameKey): SQLite's lower()
  -- leaves "Á" as it is.
  name_key TEXT NOT NULL,
  kind TEXT,
  brand TEXT,
  model TEXT,
  room TEXT,
  rated_power_w INTEGER,
  energy_class TEXT,
  notes TEXT,
  -- The manual's programmes, a JSON array (programmeSchema).
  programmes TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX equipment_name ON equipment (household_id, name_key);
ALTER TABLE appliances ADD COLUMN equipment_id TEXT REFERENCES equipment (id) ON DELETE SET NULL;
