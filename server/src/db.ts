// SPDX-License-Identifier: AGPL-3.0-or-later
// Adapted from Faturómetro (server/src/db.ts).
/** Minimal SQL interface: Cloudflare D1 in production, node:sqlite in tests. */
export type SqlValue = string | number | null | Uint8Array;

/** One statement of a batch; built by repo/ functions only. */
export interface Statement {
  query: string;
  params: SqlValue[];
}

export interface Sql {
  first<T>(query: string, ...params: SqlValue[]): Promise<T | null>;
  all<T>(query: string, ...params: SqlValue[]): Promise<T[]>;
  run(query: string, ...params: SqlValue[]): Promise<void>;
  /** Runs every statement in one transaction; the rows each one changed, in order. */
  batch(statements: Statement[]): Promise<number[]>;
  /** Size of the database in bytes, if the engine reports it. */
  sizeBytes?(): Promise<number | null>;
  /** Rows read so far through this connection, if the engine reports them (D1). */
  rowsRead?(): number;
  /** Rows written so far through this connection, if the engine reports them (D1). */
  rowsWritten?(): number;
}

/**
 * D1 refuses every query that reads rows once the free plan's 5 000 000 rows a
 * day are used up, until midnight UTC (seen on 2026-10-25: "Your account has
 * exceeded D1's free tier daily row read limit…", code 7500).
 */
const LIMIT_ERROR = /free tier daily row \w+ limit/i;

export function isDatabaseLimit(error: unknown): boolean {
  return error instanceof Error && LIMIT_ERROR.test(error.message);
}

/** The subset of Cloudflare's D1Database used here (no dependency on its types). */
type D1Value = string | number | null | ArrayBuffer;
interface D1Meta {
  size_after?: number;
  rows_read?: number;
  rows_written?: number;
}
interface D1Statement {
  bind(...values: D1Value[]): D1Statement;
  all<T>(): Promise<{ results: T[]; meta?: D1Meta }>;
  run(): Promise<{ meta?: D1Meta }>;
}
export interface D1Like {
  prepare(query: string): D1Statement;
  batch(statements: D1Statement[]): Promise<{ meta: { changes: number } & D1Meta }[]>;
}

/** D1 stores an ArrayBuffer as a BLOB. */
function toD1(value: SqlValue): D1Value {
  if (!(value instanceof Uint8Array)) return value;
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

export function d1(db: D1Like): Sql {
  const statement = (query: string, params: SqlValue[]) =>
    db.prepare(query).bind(...params.map(toD1));
  // Every result says how many rows it read: the free plan's binding limit.
  let rowsRead = 0;
  let rowsWritten = 0;
  const count = <R extends { meta?: D1Meta }>(result: R): R => {
    rowsRead += result.meta?.rows_read ?? 0;
    rowsWritten += result.meta?.rows_written ?? 0;
    return result;
  };
  const all = async <T>(query: string, params: SqlValue[]) =>
    count(await statement(query, params).all<T>()).results;
  return {
    first: async <T>(query: string, ...params: SqlValue[]) =>
      (await all<T>(query, params))[0] ?? null,
    all: <T>(query: string, ...params: SqlValue[]) => all<T>(query, params),
    run: async (query: string, ...params: SqlValue[]) => {
      count(await statement(query, params).run());
    },
    batch: async (statements: Statement[]) =>
      statements.length === 0
        ? []
        : (await db.batch(statements.map((s) => statement(s.query, s.params)))).map(
            (result) => count(result).meta.changes,
          ),
    // D1 reports the database size with every result.
    sizeBytes: async () => (await db.prepare('SELECT 1').all<unknown>()).meta?.size_after ?? null,
    rowsRead: () => rowsRead,
    rowsWritten: () => rowsWritten,
  };
}
