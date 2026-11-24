// SPDX-License-Identifier: AGPL-3.0-or-later
import { gzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openBackup } from '../../scripts/backup/backup-file';
import { createApp } from '../../server/src/app';
import { hashPassword } from '../../server/src/password';
import { createHousehold } from '../../server/src/repo/households';
import { addUsage, utcDay } from '../../server/src/repo/usage';
import { createUser } from '../../server/src/repo/users';
import { ROWS_WRITTEN_LIMIT } from '../../server/src/routes/admin';
import { memorySql } from '../../server/test/sqlite';
import { makeCopy } from './copy';
import { MAX_RESTORE_ROWS, type Row } from './format';
import {
  chunks,
  openCopy,
  restoreProgress,
  resumeRestore,
  runRestore,
  startRestore,
} from './restore';
import { gzippedLines, openGzipped, readSealed, sealGzipped, SealError, sealKey } from './seal';

// What kept.ts would keep in IndexedDB, here in memory.
const kept = new Map<string, unknown>();
vi.mock('./kept', () => ({
  readKept: async (name: string) => kept.get(name) ?? null,
  writeKept: async (name: string, value: unknown) => {
    kept.set(name, structuredClone(value));
    return true;
  },
  removeKept: async (...names: string[]) => {
    for (const name of names) kept.delete(name);
  },
}));

const ORIGIN = 'https://app.example';
const PASSWORD = 'uma password comprida';
const NOW = Date.parse('2026-11-24T10:00:00Z') / 1000;
const MINUTE0 = Date.parse('2026-11-20T00:00:00Z') / 1000;
const MIDNIGHT = Date.parse('2026-11-25T00:00:00Z') / 1000;

/** A server with one household and its user signed in; fetch goes to it. */
async function server() {
  const { sql, db } = memorySql();
  const app = createApp({ sql, sessionSecret: 's'.repeat(32), allowedOrigins: [], now: () => NOW });
  const household = (await createHousehold(sql, 'Casa', 0)).id;
  const email = 'ana@example.pt';
  await createUser(
    sql,
    { householdId: household, email, passwordHash: await hashPassword(PASSWORD, 1000) },
    0,
  );
  const login = await app.request(`${ORIGIN}/v1/auth/login`, {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const cookie = /__Host-wm_session=[^;]+/.exec(login.headers.get('Set-Cookie') ?? '')?.[0] ?? '';
  const use = () =>
    vi.stubGlobal('fetch', (path: string, init: RequestInit = {}) =>
      app.request(`${ORIGIN}${path}`, {
        ...init,
        headers: { ...(init.headers as Record<string, string>), Origin: ORIGIN, Cookie: cookie },
      }),
    );
  return { sql, db, household, use };
}

beforeEach(() => {
  kept.clear();
  vi.stubGlobal('window', new EventTarget());
});
afterEach(() => vi.unstubAllGlobals());

describe('the sealed file', () => {
  it('opens with the password only, and with the administrator script too', async () => {
    // node:zlib in the test only; the app gzips with CompressionStream.
    const zipped = new Uint8Array(gzipSync('{"a":1}\n["b",[]]\n'));
    const file = await sealGzipped(zipped, 'segredo comprido', 1000);
    const copy = readSealed(file);
    expect(copy.iterations).toBe(1000);
    const opened = await openGzipped(copy, await sealKey('segredo comprido', copy.salt, 1000));
    const lines: string[] = [];
    for await (const line of gzippedLines(opened)) lines.push(line);
    expect(lines).toEqual(['{"a":1}', '["b",[]]']);
    await expect(openGzipped(copy, await sealKey('outra', copy.salt, 1000))).rejects.toMatchObject({
      reason: 'wrongPassword',
    });
    expect(openBackup(Buffer.from(file), 'segredo comprido').toString()).toBe(
      '{"a":1}\n["b",[]]\n',
    );
    expect(() => readSealed(new Uint8Array(64))).toThrow(SealError);
  });
});

describe('chunks', () => {
  it('splits a page into parts the server takes', () => {
    const rows: Row[] = Array.from({ length: MAX_RESTORE_ROWS * 2 + 3 }, (_, index) => [index]);
    expect(chunks(rows, 0).map((part) => part.length)).toEqual([
      MAX_RESTORE_ROWS,
      MAX_RESTORE_ROWS,
      3,
    ]);
    expect(chunks(rows, MAX_RESTORE_ROWS * 2)).toEqual([[[1000], [1001], [1002]]]);
    const wide: Row[] = Array.from({ length: 5 }, () => ['x'.repeat(150_000)]);
    expect(chunks(wide, 0).map((part) => part.length)).toEqual([2, 2, 1]);
  });
});

describe('a copy made and put back', () => {
  it('copies a house and joins it into another server, over two days', async () => {
    const source = await server();
    source.db.exec(`
      INSERT INTO devices (id, household_id, name, token_hash, created_at)
        VALUES ('d1', '${source.household}', 'Quadro', 'hash', 1);
      INSERT INTO tariffs (id, household_id, valid_from, power_va, option, cycle, periods_map,
          fixed_per_day, price_simple, iec_per_kwh, cav_per_month, dgeg_per_month, large_family,
          created_at)
        VALUES ('t', '${source.household}', '2026-01-01', 6900, 'simple', 'daily', 'pre-2027',
          30000, 150000, 1000, 285, 7, 0, 5);`);
    const insert = source.db.prepare(`INSERT INTO readings_1m (device_id, channel, ts,
        household_id, samples, energy_wh, power_avg_w, power_min_w, power_max_w, voltage_min_dv,
        voltage_avg_dv, voltage_max_dv, pf_avg_pct) VALUES ('d1', 0, ?, ?, 60, 5, 300, 200, 400,
        2280, 2300, 2320, 95)`);
    for (let index = 0; index < 2100; index++) insert.run(MINUTE0 + index * 60, source.household);

    source.use();
    const seen: number[] = [];
    const made = await makeCopy(
      PASSWORD,
      'Casa',
      (rows) => seen.push(rows),
      () => NOW,
    );
    if (!made.ok) throw new Error(made.reason);
    expect(made.rows).toBe(2103);
    expect(seen.at(-1)).toBe(2103);
    const text = openBackup(Buffer.from(made.file), PASSWORD).toString();
    expect(JSON.parse(text.split('\n')[0]!)).toEqual({
      format: 'wattometro-casa',
      version: 1,
      createdAt: NOW,
      householdName: 'Casa',
    });

    expect(await openCopy(made.file, 'errada')).toEqual({ ok: false, reason: 'wrongPassword' });
    expect(await openCopy(new Uint8Array(100), PASSWORD)).toEqual({
      ok: false,
      reason: 'notACopy',
    });
    const opened = await openCopy(made.file, PASSWORD);
    if (!opened.ok) throw new Error(opened.reason);
    expect(opened.copy.total).toBe(2103);
    expect(opened.copy.totals).toMatchObject({ minutes: 2100, devices: 1, tariffs: 1 });

    // Into another server whose day of writes is nearly used up.
    const target = await server();
    target.use();
    await addUsage(target.sql, utcDay(NOW), 0, 0.6 * ROWS_WRITTEN_LIMIT);
    expect(await startRestore(opened.copy, target.household)).toBe(true);
    expect(await runRestore(target.household)).toBe('busy');
    expect(await restoreProgress()).toMatchObject({ waitUntil: MIDNIGHT, done: 0 });
    // The next day, opening the app goes on.
    target.db.exec(`DELETE FROM maintenance_state WHERE name LIKE 'rows_written:%'`);
    await resumeRestore(target.household, MIDNIGHT - 1);
    expect(await restoreProgress()).toMatchObject({ done: 0 });
    await resumeRestore(target.household, MIDNIGHT);
    expect(await restoreProgress()).toMatchObject({ finished: true, done: 2103, written: 2103 });
    const minutes = target.db
      .prepare('SELECT COUNT(*) AS n FROM readings_1m WHERE household_id = ?')
      .get(target.household);
    expect(minutes).toEqual({ n: 2100 });
    // The sealed file is no longer kept, only the outcome.
    expect(kept.has('restoreFile')).toBe(false);
  });
});
