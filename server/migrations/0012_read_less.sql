-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Fewer rows read (D1's free plan stops all reads after 5 million a day).

-- E-Redes days: how many quarter hours were imported, and how many E-Redes
-- estimated, so the import summary adds up ~365 days instead of reading
-- every quarter hour. NULL for Shelly rows, and for E-Redes days imported
-- before this migration until the export is imported again.
ALTER TABLE daily ADD COLUMN quarters INTEGER;
ALTER TABLE daily ADD COLUMN estimated INTEGER;

-- "Qualidade" asks for a period across all meters: without this index the
-- primary key (household_id, meter, ts) could only narrow it to the household.
CREATE INDEX voltage_10m_household_ts ON voltage_10m (household_id, ts);
