-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Fewer rows read: "Potência" and "Início" took their peaks from every minute
-- of the last 90 days (~130 000 rows a meter, on every visit). The quarter
-- hours and the days keep what the contracted power needs, so the minutes are
-- only read for the stretch the Cron has not rolled up yet. NULL for E-Redes.

-- Highest one-second apparent power (VA) of the minutes that have it.
ALTER TABLE readings_15m ADD COLUMN apparent_max_va INTEGER;
-- Minutes with an apparent peak (sent with per-second values).
ALTER TABLE readings_15m ADD COLUMN apparent_minutes INTEGER;
-- Highest one-second active power (W) of the minutes without an apparent peak.
ALTER TABLE readings_15m ADD COLUMN active_only_max_w INTEGER;

ALTER TABLE daily ADD COLUMN apparent_max_va INTEGER;
ALTER TABLE daily ADD COLUMN apparent_minutes INTEGER;
ALTER TABLE daily ADD COLUMN active_only_max_w INTEGER;

-- Today's quarter hours of every meter ("Início", every minute): the primary
-- key (household_id, meter, ts) could only narrow it to the household.
CREATE INDEX readings_15m_household_ts ON readings_15m (household_id, ts);

-- The quarter hours and days already rolled up, from the minutes still kept.
UPDATE readings_15m SET apparent_max_va = m.apparent_max_va,
  apparent_minutes = m.apparent_minutes, active_only_max_w = m.active_only_max_w
FROM (
  SELECT household_id, device_id || ':' || channel AS meter, ts - ts % 900 AS ts,
    MAX(apparent_max_va) AS apparent_max_va, COUNT(apparent_max_va) AS apparent_minutes,
    MAX(CASE WHEN apparent_max_va IS NULL THEN power_max_w END) AS active_only_max_w
  FROM readings_1m GROUP BY household_id, device_id, channel, ts - ts % 900
) AS m
WHERE readings_15m.household_id = m.household_id AND readings_15m.meter = m.meter
  AND readings_15m.ts = m.ts;

UPDATE daily SET apparent_max_va = q.apparent_max_va, apparent_minutes = q.apparent_minutes,
  active_only_max_w = q.active_only_max_w
FROM (
  SELECT household_id, meter, day, MAX(apparent_max_va) AS apparent_max_va,
    SUM(apparent_minutes) AS apparent_minutes, MAX(active_only_max_w) AS active_only_max_w
  FROM (
    SELECT household_id, meter, apparent_max_va, apparent_minutes, active_only_max_w,
      -- The Lisbon day of the quarter: UTC+0 in winter, UTC+1 from the last Sunday of March
      -- to the last Sunday of October (01:00 UTC both), as src/lib/time.ts.
      date(ts + CASE
        WHEN ts >= unixepoch(date(strftime('%Y', ts, 'unixepoch') || '-03-31', '-6 days',
            'weekday 0')) + 3600
          AND ts < unixepoch(date(strftime('%Y', ts, 'unixepoch') || '-10-31', '-6 days',
            'weekday 0')) + 3600
        THEN 3600 ELSE 0 END, 'unixepoch') AS day
    FROM readings_15m WHERE source = 'shelly'
  )
  GROUP BY household_id, meter, day
) AS q
WHERE daily.household_id = q.household_id AND daily.meter = q.meter AND daily.day = q.day;
