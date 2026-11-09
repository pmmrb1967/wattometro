-- SPDX-License-Identifier: AGPL-3.0-or-later
-- What stays on, linked to the registered equipment it is
-- (src/domain/always-on-links.ts): it takes the equipment's name, and keeps
-- the link when the equipment is renamed. The items already named as an
-- equipment are linked the next time the list is read (repo/always-on.ts):
-- SQLite's lower() leaves "Á" as it is, so the names are compared there.
ALTER TABLE always_on ADD COLUMN equipment_id TEXT REFERENCES equipment (id) ON DELETE SET NULL;
