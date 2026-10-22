-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Contracted power (Phase 3.4): the smart meter limits apparent power (VA),
-- docs/contracted-power.md. Highest one-second sqrt(P² + Q²) of the minute, from
-- the per-second values; NULL when the minute came without them.
ALTER TABLE readings_1m ADD COLUMN apparent_max_va INTEGER;
