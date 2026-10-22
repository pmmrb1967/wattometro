-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Quarter hours imported from the E-Redes export (docs/eredes-csv.md): 1 when
-- E-Redes estimated the value, 0 when measured; NULL for Shelly rows.
ALTER TABLE readings_15m ADD COLUMN estimated INTEGER CHECK (estimated IN (0, 1));
