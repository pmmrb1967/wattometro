// SPDX-License-Identifier: AGPL-3.0-or-later
import { isDatabaseLimit, type Sql } from '../db';

/**
 * 'ok' when the database answers, 'limit' when D1 refuses reads for the day
 * (db.ts), 'down' otherwise. It reads one real row: a query that reads none
 * still works past the daily limit.
 */
export async function databaseState(sql: Sql): Promise<'ok' | 'limit' | 'down'> {
  try {
    await sql.first('SELECT id FROM households LIMIT 1');
    return 'ok';
  } catch (error) {
    return isDatabaseLimit(error) ? 'limit' : 'down';
  }
}
