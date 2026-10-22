// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { d1, type D1Like } from './db';

/** Records what the adapter hands to D1. */
function fakeD1() {
  const bound: unknown[][] = [];
  type Statement = Parameters<D1Like['batch']>[0][number];
  const statement = (): Statement => ({
    bind: (...values) => {
      bound.push(values);
      return statement();
    },
    first: async () => null,
    all: async () => ({ results: [] }),
    run: async () => ({}),
  });
  const db: D1Like = {
    prepare: () => statement(),
    batch: async (statements) => statements.map((_, i) => ({ meta: { changes: i % 2 } })),
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
});
