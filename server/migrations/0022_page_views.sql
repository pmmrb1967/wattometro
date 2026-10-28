-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Visits per Lisbon day and page, for the administrator's panel (docs/admin.md):
-- totals only, with no user, household, address or time of day. Kept 90 days.
CREATE TABLE page_views (
  day TEXT NOT NULL,
  page TEXT NOT NULL,
  views INTEGER NOT NULL CHECK (views > 0),
  PRIMARY KEY (day, page)
) WITHOUT ROWID;
