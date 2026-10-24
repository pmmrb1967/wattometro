-- SPDX-License-Identifier: AGPL-3.0-or-later
-- What the household said about its installation (src/domain/installation.ts).
-- One row per household, absent until first saved; NULL = not known.
CREATE TABLE household_installation (
  household_id TEXT PRIMARY KEY REFERENCES households (id) ON DELETE CASCADE,
  -- Room heating, several at once: kinds joined by ',' in HEATING_KINDS order.
  heating TEXT CHECK (heating <> ''),
  air_conditioning INTEGER CHECK (air_conditioning IN (0, 1)),
  water_heating TEXT CHECK (water_heating IN ('gas', 'electric', 'heat-pump', 'solar')),
  hob TEXT CHECK (hob IN ('electric', 'gas')),
  solar_panels INTEGER CHECK (solar_panels IN (0, 1)),
  electric_car INTEGER CHECK (electric_car IN (0, 1)),
  updated_at INTEGER NOT NULL
);
