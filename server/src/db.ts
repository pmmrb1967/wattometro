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
}

/** The subset of Cloudflare's D1Database used here (no dependency on its types). */
type D1Value = string | number | null | ArrayBuffer;
interface D1Statement {
  bind(...values: D1Value[]): D1Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
export interface D1Like {
  prepare(query: string): D1Statement;
  batch(statements: D1Statement[]): Promise<{ meta: { changes: number } }[]>;
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
  return {
    first: <T>(query: string, ...params: SqlValue[]) => statement(query, params).first<T>(),
    all: async <T>(query: string, ...params: SqlValue[]) =>
      (await statement(query, params).all<T>()).results,
    run: async (query: string, ...params: SqlValue[]) => {
      await statement(query, params).run();
    },
    batch: async (statements: Statement[]) =>
      statements.length === 0
        ? []
        : (await db.batch(statements.map((s) => statement(s.query, s.params)))).map(
            (result) => result.meta.changes,
          ),
  };
}
