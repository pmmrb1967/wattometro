// SPDX-License-Identifier: AGPL-3.0-or-later
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { SECTION_ORDER, type Row, type Section } from '../../src/backup/format';
import { memorySql } from '../test/sqlite';
import { createApp } from './app';
import { hashPassword } from './password';
import { createHousehold } from './repo/households';
import { createUser } from './repo/users';
import { addUsage, utcDay } from './repo/usage';
import { ROWS_WRITTEN_LIMIT } from './routes/admin';

const ORIGIN = 'https://app.example';
const PASSWORD = 'uma password comprida';
const NOW = Date.parse('2026-11-24T10:00:00Z') / 1000;
const MINUTE0 = Date.parse('2026-11-20T00:00:00Z') / 1000;

interface Server {
  db: DatabaseSync;
  app: ReturnType<typeof createApp>;
  sql: ReturnType<typeof memorySql>['sql'];
  households: string[];
  cookies: string[];
}

async function server(emails: string[]): Promise<Server> {
  const { sql, db } = memorySql();
  const app = createApp({ sql, sessionSecret: 's'.repeat(32), allowedOrigins: [], now: () => NOW });
  const households: string[] = [];
  const cookies: string[] = [];
  for (const email of emails) {
    const id = (await createHousehold(sql, email, 0)).id;
    await createUser(
      sql,
      { householdId: id, email, passwordHash: await hashPassword(PASSWORD, 1000) },
      0,
    );
    households.push(id);
    const response = await app.request(`${ORIGIN}/v1/auth/login`, {
      method: 'POST',
      headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    const value = /__Host-wm_session=([^;]+)/.exec(response.headers.get('Set-Cookie') ?? '')?.[1];
    cookies.push(`__Host-wm_session=${value}`);
  }
  return { db, app, sql, households, cookies };
}

const call = (s: Server, index: number, method: string, path: string, body?: unknown) =>
  s.app.request(`${ORIGIN}${path}`, {
    method,
    headers: { Origin: ORIGIN, Cookie: s.cookies[index]!, 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

/** A house with a bit of everything; `minutes` on the first device (over a page of 2000). */
function seed(db: DatabaseSync, household: string, minutes = 2100) {
  db.exec(`
    UPDATE households SET quality_zone = 'B', location_name = 'Lisboa', latitude_cdeg = 3872,
      longitude_cdeg = -914 WHERE id = '${household}';
    INSERT INTO household_installation (household_id, heating, air_conditioning, updated_at)
      VALUES ('${household}', 'gas', 0, 1);
    INSERT INTO household_budget (household_id, cents, wh_per_day, updated_at)
      VALUES ('${household}', 6000, 8000, 1);
    INSERT INTO tariffs (id, household_id, valid_from, supplier, power_va, option, cycle,
        periods_map, fixed_per_day, price_simple, iec_per_kwh, cav_per_month, dgeg_per_month,
        large_family, created_at)
      VALUES ('t-${household}', '${household}', '2026-01-01', 'X', 6900, 'simple', 'daily',
        'pre-2027', 30000, 150000, 1000, 285, 7, 0, 5);
    INSERT INTO devices (id, household_id, name, token_hash, created_at)
      VALUES ('d1-${household}', '${household}', 'Quadro', 'hash1-${household}', 1),
             ('d2-${household}', '${household}', 'Cozinha', 'hash2-${household}', 1);
    INSERT INTO equipment (id, household_id, name, name_key, programmes, created_at)
      VALUES ('e-${household}', '${household}', 'Máquina', 'máquina', '[]', 1);
    INSERT INTO appliances (id, household_id, label, power_w, states_w, pulsing, created_at,
        equipment_id)
      VALUES ('a-${household}', '${household}', 'Máquina', 2000, '[2000]', 0, 1, 'e-${household}');
    INSERT INTO always_on (id, household_id, label, quantity, measured, created_at)
      VALUES ('o-${household}', '${household}', 'Router', 1, 0, 1);
    INSERT INTO signatures (id, household_id, device_id, channel, label, start_at, end_at,
        created_at)
      VALUES ('s-${household}', '${household}', 'd1-${household}', 0, 'Forno', 10, 70, 1);
    INSERT INTO signature_seconds (signature_id, ts, household_id, data)
      VALUES ('s-${household}', 60, '${household}', X'0102FF');
    INSERT INTO outages (device_id, boot_at, household_id, start_at)
      VALUES ('d1-${household}', 500, '${household}', 400);
    INSERT INTO daily (household_id, meter, day, source, minutes, energy_wh)
      VALUES ('${household}', 'd1-${household}:0', '2026-11-20', 'shelly', 1440, 9000),
             ('${household}', 'eredes', '2026-11-20', 'eredes', NULL, 9100);
    INSERT INTO readings_15m (household_id, meter, ts, source, energy_wh)
      VALUES ('${household}', 'eredes', ${MINUTE0}, 'eredes', 90);
    INSERT INTO voltage_10m (household_id, meter, ts, minutes, voltage_avg_dv, voltage_min_dv,
        voltage_max_dv)
      VALUES ('${household}', 'd1-${household}:0', ${MINUTE0}, 10, 2300, 2280, 2330);
    INSERT INTO nilm_days (household_id, meter, day, version, minutes, data, updated_at)
      VALUES ('${household}', 'd1-${household}:0', '2026-11-20', 1, 1440, X'AABB', 3);
  `);
  const insert = db.prepare(`INSERT INTO readings_1m (device_id, channel, ts, household_id, samples,
      energy_wh, power_avg_w, power_min_w, power_max_w, voltage_min_dv, voltage_avg_dv,
      voltage_max_dv, pf_avg_pct) VALUES (?, ?, ?, ?, 60, 5, 300, 200, 400, 2280, 2300, 2320, 95)`);
  for (let index = 0; index < minutes; index++) {
    insert.run(`d1-${household}`, index % 2, MINUTE0 + index * 60, household);
  }
  insert.run(`d2-${household}`, 0, MINUTE0, household);
}

/** Every section of the household, page after page, as the browser does. */
async function exportAll(s: Server, index: number) {
  const pages: [Section, Row[]][] = [];
  let requests = 0;
  for (const section of SECTION_ORDER) {
    let cursor: unknown = null;
    do {
      const query = new URLSearchParams({ section });
      if (cursor) query.set('cursor', JSON.stringify(cursor));
      const response = await call(s, index, 'GET', `/v1/backup/export?${query}`);
      expect(response.status).toBe(200);
      const page = (await response.json()) as { rows: Row[]; next: unknown };
      requests++;
      if (page.rows.length > 0) pages.push([section, page.rows]);
      cursor = page.next;
    } while (cursor !== null);
  }
  return { pages, requests };
}

async function restoreAll(s: Server, index: number, pages: [Section, Row[]][]) {
  let written = 0;
  for (const [section, rows] of pages) {
    for (let start = 0; start < rows.length; start += 500) {
      const response = await call(s, index, 'POST', '/v1/backup/restore', {
        section,
        rows: rows.slice(start, start + 500),
      });
      expect(response.status).toBe(200);
      written += ((await response.json()) as { written: number }).written;
    }
  }
  return written;
}

const count = (db: DatabaseSync, table: string, household: string) =>
  (
    db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE household_id = ?`).get(household) as {
      n: number;
    }
  ).n;

const TABLES = [
  'tariffs',
  'devices',
  'equipment',
  'appliances',
  'always_on',
  'signatures',
  'signature_seconds',
  'outages',
  'daily',
  'readings_15m',
  'voltage_10m',
  'nilm_days',
  'readings_1m',
  'household_installation',
  'household_budget',
];

describe('the household copy', () => {
  let source: Server;
  beforeEach(async () => {
    source = await server(['ana@example.pt', 'rui@example.pt']);
    seed(source.db, source.households[0]!);
    seed(source.db, source.households[1]!, 10);
  });

  it('reads every row of the household, and only its own, a page at a time', async () => {
    const { pages, requests } = await exportAll(source, 0);
    const rows = (section: Section) =>
      pages.filter(([name]) => name === section).flatMap(([, part]) => part);
    expect(rows('minutes')).toHaveLength(2101);
    // 2101 minutes: a full page and the rest, the second device included.
    expect(pages.filter(([name]) => name === 'minutes')).toHaveLength(2);
    expect(requests).toBe(SECTION_ORDER.length + 1);
    const own = source.households[0]!;
    expect(rows('minutes').every((row) => String(row[0]).endsWith(own))).toBe(true);
    expect(rows('household')).toEqual([
      ['B', 'Lisboa', 3872, -914, 'gas', 0, null, null, null, null, 6000, 8000],
    ]);
    // Blobs as base64url.
    expect(rows('signatureSeconds')).toEqual([[`s-${own}`, 60, 'AQL_']]);
  });

  it('puts a copy back into an empty house of another database, whole', async () => {
    const { pages } = await exportAll(source, 0);
    const target = await server(['ana@example.pt']);
    const written = await restoreAll(target, 0, pages);
    const from = source.households[0]!;
    const to = target.households[0]!;
    for (const table of TABLES) {
      expect([table, count(target.db, table, to)]).toEqual([table, count(source.db, table, from)]);
    }
    expect(written).toBeGreaterThan(2101);
    expect(
      target.db.prepare('SELECT quality_zone, location_name FROM households WHERE id = ?').get(to),
    ).toEqual({ quality_zone: 'B', location_name: 'Lisboa' });
    expect(target.db.prepare('SELECT hex(data) AS data FROM signature_seconds').get()).toEqual({
      data: '0102FF',
    });
    expect(target.db.prepare('SELECT equipment_id FROM appliances').get()).toEqual({
      equipment_id: `e-${from}`,
    });
    // The same copy again changes nothing.
    expect(await restoreAll(target, 0, pages)).toBe(0);
  });

  it('joins: keeps what the house has, adds what it lacks', async () => {
    const own = source.households[0]!;
    const { pages } = await exportAll(source, 0);
    source.db.exec(`
      DELETE FROM readings_1m WHERE household_id = '${own}' AND ts >= ${MINUTE0 + 1000 * 60};
      UPDATE daily SET energy_wh = 1 WHERE household_id = '${own}' AND meter = 'eredes';
      UPDATE households SET location_name = 'Porto' WHERE id = '${own}';`);
    await restoreAll(source, 0, pages);
    expect(count(source.db, 'readings_1m', own)).toBe(2101);
    expect(
      source.db
        .prepare(`SELECT energy_wh FROM daily WHERE household_id = ? AND meter = 'eredes'`)
        .get(own),
    ).toEqual({ energy_wh: 1 });
    expect(source.db.prepare('SELECT location_name FROM households WHERE id = ?').get(own)).toEqual(
      { location_name: 'Porto' },
    );
  });

  it("never writes into another household's devices or signatures", async () => {
    const other = source.households[1]!;
    const before = count(source.db, 'readings_1m', other);
    const response = await call(source, 0, 'POST', '/v1/backup/restore', {
      section: 'minutes',
      rows: [
        [`d1-${other}`, 0, MINUTE0 + 3600 * 24, 60, 5, 300, 200, 400, 2280, 2300, 2320, 95, null],
      ],
    });
    expect(await response.json()).toEqual({ written: 0 });
    expect(count(source.db, 'readings_1m', other)).toBe(before);
    const seconds = await call(source, 0, 'POST', '/v1/backup/restore', {
      section: 'signatureSeconds',
      rows: [[`s-${other}`, 999, 'AQ']],
    });
    expect(await seconds.json()).toEqual({ written: 0 });
    // A link to equipment the house does not have is dropped, the appliance kept.
    const appliance = await call(source, 0, 'POST', '/v1/backup/restore', {
      section: 'appliances',
      rows: [['novo', 'Forno', 2000, '[2000]', 0, 1, null, null, null, `e-${other}`, null]],
    });
    expect(await appliance.json()).toEqual({ written: 1 });
    expect(
      source.db.prepare(`SELECT equipment_id FROM appliances WHERE id = 'novo'`).get(),
    ).toEqual({ equipment_id: null });
  });

  it('refuses rows that do not match the section', async () => {
    for (const body of [
      { section: 'minutes', rows: [['d', 0]] },
      { section: 'nonsense', rows: [[1]] },
      { section: 'minutes', rows: [] },
      { section: 'nilmDays', rows: [['m', '2026-11-20', 1, 1, 'not base64!', 1]] },
    ]) {
      expect((await call(source, 0, 'POST', '/v1/backup/restore', body)).status).toBe(400);
    }
    const big = { section: 'tariffs', rows: [['x'.repeat(1_000_001)]] };
    expect((await call(source, 0, 'POST', '/v1/backup/restore', big)).status).toBe(413);
  });

  it('stops for the day when D1 has read or written its share', async () => {
    await addUsage(source.sql, utcDay(NOW), 3_000_000, 0.6 * ROWS_WRITTEN_LIMIT);
    const page = await call(source, 0, 'GET', '/v1/backup/export?section=minutes');
    expect(page.status).toBe(503);
    const midnight = Date.parse('2026-11-25T00:00:00Z') / 1000;
    expect(await page.json()).toEqual({ error: 'busy', retryAt: midnight });
    const restore = await call(source, 0, 'POST', '/v1/backup/restore', {
      section: 'outages',
      rows: [[`d1-${source.households[0]}`, 9, null, 0]],
    });
    expect(restore.status).toBe(503);
  });

  it('checks the account password, keeps the reminder and the last copy', async () => {
    expect(
      (await call(source, 0, 'POST', '/v1/backup/password', { password: 'errada' })).status,
    ).toBe(403);
    expect(
      (await call(source, 0, 'POST', '/v1/backup/password', { password: PASSWORD })).status,
    ).toBe(204);
    const first = (await (await call(source, 0, 'GET', '/v1/backup')).json()) as Record<
      string,
      unknown
    >;
    expect(first).toMatchObject({ lastAt: null, remindDays: 7, rowsReadLimit: 5_000_000 });
    // One Shelly day (1440 minutes, 96 + 144) and one E-Redes day (no quarters counted).
    expect(first.estimateRows).toBe(2 + 1440 + 240);
    expect((await call(source, 0, 'PUT', '/v1/backup/reminder', { days: 30 })).status).toBe(204);
    expect((await call(source, 0, 'PUT', '/v1/backup/reminder', { days: 3 })).status).toBe(400);
    expect(await (await call(source, 0, 'POST', '/v1/backup/done')).json()).toEqual({
      lastAt: NOW,
    });
    expect(await (await call(source, 0, 'GET', '/v1/backup')).json()).toMatchObject({
      lastAt: NOW,
      remindDays: 30,
    });
    // The other household's stays its own.
    expect(await (await call(source, 1, 'GET', '/v1/backup')).json()).toMatchObject({
      lastAt: null,
      remindDays: 7,
    });
  });
});

describe('migration 0033', () => {
  it('adds household_backup and forgets the old administrator alert state', () => {
    const db = new DatabaseSync(':memory:');
    const folder = join(__dirname, '..', 'migrations');
    const files = readdirSync(folder)
      .filter((name) => name.endsWith('.sql'))
      .sort();
    const run = (name: string) => db.exec(readFileSync(join(folder, name), 'utf8'));
    for (const name of files.filter((name) => name < '0033')) run(name);
    db.exec(`INSERT INTO households (id, name, created_at) VALUES ('h', 'Casa', 0);
      INSERT INTO alert_state (household_id, kind, active) VALUES ('h', 'backup', 1),
        ('h', 'stale', 1);`);
    run(files.find((name) => name.startsWith('0033')) as string);
    expect(db.prepare('SELECT kind FROM alert_state').all()).toEqual([{ kind: 'stale' }]);
    db.exec(`INSERT INTO household_backup (household_id, updated_at) VALUES ('h', 1)`);
    expect(db.prepare('SELECT last_at, remind_days FROM household_backup').get()).toEqual({
      last_at: null,
      remind_days: 7,
    });
    expect(() => db.exec(`UPDATE household_backup SET remind_days = 3`)).toThrow();
  });
});
