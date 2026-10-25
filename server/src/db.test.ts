// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { d1, isDatabaseLimit, type D1Like } from './db';

/** Records what the adapter hands to D1. */
function fakeD1() {
  const bound: unknown[][] = [];
  type Statement = Parameters<D1Like['batch']>[0][number];
  const statement = (): Statement => ({
    bind: (...values) => {
      bound.push(values);
      return statement();
    },
    all: async () => ({ results: [], meta: { rows_read: 10 } }),
    run: async () => ({ meta: { rows_read: 3 } }),
  });
  const db: D1Like = {
    prepare: () => statement(),
    batch: async (statements) =>
      statements.map((_, i) => ({ meta: { changes: i % 2, rows_read: 1 } })),
  };
  return { db, bound };
}

describe('d1 adapter', () => {
  it('binds bytes as an ArrayBuffer holding exactly the view', async () => {
    const { db, bound } = fakeD1();
    const larger = new Uint8Array([9, 1, 2, 3, 9]);
    await d1(db).run('INSERT', 'x', 1, null, larger.subarray(1, 4));
    const [text, number, nothing, blob] = bound[0] ?? [];
    expect([text, number, nothing]).toEqual(['x', 1, null]);
    expect(blob).toBeInstanceOf(ArrayBuffer);
    expect([...new Uint8Array(blob as ArrayBuffer)]).toEqual([1, 2, 3]);
  });

  it('returns the changes of each batch statement, and nothing for an empty batch', async () => {
    const sql = d1(fakeD1().db);
    expect(
      await sql.batch([
        { query: 'A', params: [] },
        { query: 'B', params: [] },
        { query: 'C', params: [] },
      ]),
    ).toEqual([0, 1, 0]);
    expect(await sql.batch([])).toEqual([]);
  });

  it('adds up the rows every result read', async () => {
    const sql = d1(fakeD1().db);
    await sql.first('SELECT');
    await sql.all('SELECT');
    await sql.run('UPDATE');
    await sql.batch([
      { query: 'A', params: [] },
      { query: 'B', params: [] },
    ]);
    expect(sql.rowsRead?.()).toBe(10 + 10 + 3 + 2);
  });

  it("recognises D1's daily limit error", () => {
    const message =
      "D1_ERROR: Your account has exceeded D1's free tier daily row read limit. Upgrade to a paid plan or wait until tomorrow (midnight UTC) to continue.";
    expect(isDatabaseLimit(new Error(message))).toBe(true);
    expect(isDatabaseLimit(new Error('D1_ERROR: no such table: x'))).toBe(false);
    expect(isDatabaseLimit('free tier daily row read limit')).toBe(false);
  });
});
