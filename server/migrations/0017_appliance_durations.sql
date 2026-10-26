-- SPDX-License-Identifier: AGPL-3.0-or-later
-- How long an appliance's cycles last (Phase 8.3): two of about 2 kW (a
-- kettle for 3 minutes, a washing machine heating for 11) differ mostly in
-- that. A range that widens with every cycle the user names (programmes
-- differ); null for appliances named before, which match on power alone.
ALTER TABLE appliances ADD COLUMN min_duration_s INTEGER;
ALTER TABLE appliances ADD COLUMN max_duration_s INTEGER;
