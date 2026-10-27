-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Whole programmes (Phase 8.3, src/nilm/programmes.ts): a dishwasher and a
-- washing machine heat their water alike (~2 kW, ~11 min); the number of
-- heatings in a programme tells them apart. Null for an appliance that is not
-- a programme (and for those named before).
ALTER TABLE appliances ADD COLUMN heats INTEGER;
