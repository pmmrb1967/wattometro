// SPDX-License-Identifier: AGPL-3.0-or-later
// Adapted from Faturómetro (server/test/sqlite.ts).
/** Test-only: the server's Sql interface over node:sqlite, with the real migrations. */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Sql, SqlValue, Statement } from '../src/db';

/** Tables that grow with time: reading them whole would spend D1's 5 million rows a day. */
const LARGE = 'readings_1m|readings_1s|readings_15m|voltage_10m';
/** A full scan, or a search narrowed only to the household or the device. */
const WHOLE = new RegExp(
  String.raw`^(SCAN (${LARGE})\b(?! USING)|SEARCH (${LARGE}) USING .*\((household_id|device_id)=\?\)$)`,
);

/**
 * Every query the server tests run is checked: one that would read a large
 * table whole (every minute of the house, every quarter hour) fails the test
 * that ran it, so a new query cannot quietly exhaust the free plan.
 */
function checkPlan(db: DatabaseSync, query: string): void {
  if (!/\b(readings_1m|readings_1s|readings_15m|voltage_10m)\b/.test(query)) return;
  // A bare MIN(ts) or MAX(ts) on a (household_id, ts) index is read from one end of it:
  // one row. Not on the primary key (device_id, channel, ts) by device alone.
  const minMax = /^\s*SELECT (MIN|MAX)\(ts\)( AS \w+)? FROM \w+ WHERE [^()]*$/i.test(query);
  const plan = db.prepare(`EXPLAIN QUERY PLAN ${query}`).all() as { detail: string }[];
  const whole = plan
    .map((row) => row.detail)
    .filter(
      (detail) =>
        WHOLE.test(detail) && !(minMax && /_household_ts \(household_id=\?\)$/.test(detail)),
    );
  if (whole.length > 0) {
    throw new Error(`Reads a large table whole (${whole.join('; ')}): ${query}`);
  }
}

/** `source`: a migrations folder (every *.sql, in order) or one .sql file. */
export function memorySql(source = 'migrations'): { sql: Sql; db: DatabaseSync } {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  const path = join(__dirname, '..', source);
  const files = source.endsWith('.sql')
    ? [path]
    : readdirSync(path)
        .filter((name) => name.endsWith('.sql'))
        .sort()
        .map((name) => join(path, name));
  for (const file of files) db.exec(readFileSync(file, 'utf8'));
  const prepare = (query: string) => {
    checkPlan(db, query);
    return db.prepare(query);
  };
  const sql: Sql = {
    first: async <T>(query: string, ...params: SqlValue[]) =>
      (prepare(query).get(...params) as T | undefined) ?? null,
    all: async <T>(query: string, ...params: SqlValue[]) => prepare(query).all(...params) as T[],
    run: async (query: string, ...params: SqlValue[]) => {
      prepare(query).run(...params);
    },
    batch: async (statements: Statement[]) => {
      db.exec('BEGIN');
      try {
        const changes = statements.map((s) => Number(prepare(s.query).run(...s.params).changes));
        db.exec('COMMIT');
        return changes;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    sizeBytes: async () => {
      const pages = db.prepare('PRAGMA page_count').get() as { page_count: number };
      const size = db.prepare('PRAGMA page_size').get() as { page_size: number };
      return pages.page_count * size.page_size;
    },
  };
  return { sql, db };
}
