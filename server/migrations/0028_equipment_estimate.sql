-- SPDX-License-Identifier: AGPL-3.0-or-later
-- An equipment's estimate for "Onde vai o consumo" (src/domain/equipment-estimate.ts):
-- the energy label's value and unit, or the plate, and the use the user states,
-- as JSON (estimateSchema). NULL when there is none.
ALTER TABLE equipment ADD COLUMN estimate TEXT;
