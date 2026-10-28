// SPDX-License-Identifier: AGPL-3.0-or-later
/** The administrator's panel (docs/admin.md): totals only, nothing that names a person. */
import type { Sql } from '../db';

/** One more visit to a page on a Lisbon day (one row a page a day). */
export async function recordVisit(sql: Sql, day: string, page: string): Promise<void> {
  await sql.run(
    `INSERT INTO page_views (day, page, views) VALUES (?, ?, 1)
     ON CONFLICT (day, page) DO UPDATE SET views = views + 1`,
    day,
    page,
  );
}

export interface PageVisits {
  page: string;
  /** Visits on `today`. */
  today: number;
  /** Visits since `fromDay`, `today` included. */
  total: number;
}

/** Visits per page since `fromDay` (a primary-key range), most visited first. */
export async function visitsSince(sql: Sql, fromDay: string, today: string): Promise<PageVisits[]> {
  const rows = await sql.all<{ page: string; today: number; total: number }>(
    `SELECT page, SUM(CASE WHEN day = ? THEN views ELSE 0 END) AS today, SUM(views) AS total
     FROM page_views WHERE day >= ? GROUP BY page ORDER BY total DESC, page`,
    today,
    fromDay,
  );
  return rows;
}

/** Forgets the visits of the days before `day`. */
export async function purgeVisits(sql: Sql, day: string): Promise<void> {
  await sql.run('DELETE FROM page_views WHERE day < ?', day);
}

export interface AccountTotals {
  users: number;
  households: number;
  /** Browsers subscribed to alerts (push_subscriptions). */
  pushDevices: number;
}

export async function accountTotals(sql: Sql): Promise<AccountTotals> {
  const row = await sql.first<{ users: number; households: number; push_devices: number }>(
    `SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM households) AS households,
       (SELECT COUNT(*) FROM push_subscriptions) AS push_devices`,
  );
  return {
    users: row?.users ?? 0,
    households: row?.households ?? 0,
    pushDevices: row?.push_devices ?? 0,
  };
}
