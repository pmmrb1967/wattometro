// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Sql } from '../db';

/** True when the database answers a trivial query. */
export async function databaseReachable(sql: Sql): Promise<boolean> {
  try {
    const row = await sql.first<{ ok: number }>('SELECT 1 AS ok');
    return row?.ok === 1;
  } catch {
    return false;
  }
}
