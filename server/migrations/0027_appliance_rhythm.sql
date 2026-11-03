-- SPDX-License-Identifier: AGPL-3.0-or-later
-- A pulsing appliance's rhythm, the typical seconds from one pulse's start to
-- the next (src/nilm/appliances.ts): a hob's regulator pulses every 44 s, an
-- airfryer's thermostat every 60 s, at about the same power. NULL until known.
ALTER TABLE appliances ADD COLUMN period_s INTEGER;
