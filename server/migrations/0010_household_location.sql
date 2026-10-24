-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Where the house is, for the weather (docs/open-meteo.md): the locality chosen
-- by the user (never an address or GPS), its centre in hundredths of a degree
-- (~1 km). All three NULL until a locality is chosen.
ALTER TABLE households ADD COLUMN location_name TEXT;
ALTER TABLE households ADD COLUMN latitude_cdeg INTEGER CHECK (latitude_cdeg BETWEEN -9000 AND 9000);
ALTER TABLE households ADD COLUMN longitude_cdeg INTEGER CHECK (longitude_cdeg BETWEEN -18000 AND 18000);
