// SPDX-License-Identifier: AGPL-3.0-or-later
import type { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { decodeSeconds } from '../../src/lib/readings-1s';
import { memorySql } from '../test/sqlite';
import { createApp } from './app';
import { DEVICE_TOKEN_PREFIX } from './auth';
import type { Sql } from './db';
import { MAX_AGE_SECONDS, MAX_INGEST_BYTES } from './ingest';
import { hashPassword } from './password';
import { createHousehold } from './repo/households';
import { createUser } from './repo/users';

const ORIGIN = 'https://app.example';
const PASSWORD = 'uma password comprida';
const LIMIT = 5;
// A whole minute: 1_792_000_020 is 20 s into it.
const MINUTE = 1_792_000_000 - (1_792_000_000 % 60);

let app: ReturnType<typeof createApp>;
let sql: Sql;
let db: DatabaseSync;
let clock: number;

beforeEach(async () => {
  const memory = memorySql();
  sql = memory.sql;
  db = memory.db;
  clock = MINUTE + 75;
  app = createApp({
    sql,
    sessionSecret: 's'.repeat(32),
    allowedOrigins: [],
    now: () => clock,
    ingestRequestsPerMinute: LIMIT,
  });
  for (const [email, home] of [
    ['ana@example.pt', 'Casa'],
    ['rui@example.pt', 'Outra'],
  ] as const) {
    const householdId = (await createHousehold(sql, home, clock)).id;
    await createUser(
      sql,
      { householdId, email, passwordHash: await hashPassword(PASSWORD, 1000) },
      clock,
    );
  }
});

async function signIn(email = 'ana@example.pt'): Promise<string> {
  const response = await app.request(`${ORIGIN}/v1/auth/login`, {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const value = /__Host-wm_session=([^;]+)/.exec(response.headers.get('Set-Cookie') ?? '')?.[1];
  if (!value) throw new Error('no session cookie');
  return `__Host-wm_session=${value}`;
}

const asUser = (cookie: string, method: string, path: string, body?: unknown) =>
  app.request(`${ORIGIN}${path}`, {
    method,
    headers: { Origin: ORIGIN, Cookie: cookie, 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

async function register(cookie: string, name = 'Quadro') {
  const response = await asUser(cookie, 'POST', '/v1/devices', { name });
  expect(response.status).toBe(201);
  return (await response.json()) as { device: { id: string }; token: string };
}

const send = (token: string, payload: unknown) =>
  app.request(`${ORIGIN}/v1/ingest`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });

const seconds = (value: (s: number) => number | null) =>
  Array.from({ length: 60 }, (_, s) => value(s));

/** A plausible minute: 500–559 W, 230.0–235.9 V. */
const minute = (t: number, extra: Record<string, unknown> = {}) => ({
  t,
  c: 0,
  n: 60,
  e: 9,
  pa: 530,
  pn: 500,
  px: 559,
  va: 2330,
  vn: 2300,
  vx: 2359,
  pf: 97,
  p: seconds((s) => 500 + s),
  q: seconds((s) => (s === 10 ? null : 120)),
  u: seconds((s) => 2300 + s),
  ...extra,
});

/** The same minute without the per-second values (the script drops them when short of memory). */
const aggregate = (t: number) => ({ ...minute(t), p: undefined, q: undefined, u: undefined });

const payload = (minutes: unknown[]) => ({
  v: 1,
  sv: '0.1.0',
  m: 'S3EM-002CXCEU',
  fw: '1.4.4',
  min: minutes,
});

const count = (table: string) =>
  (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

describe('devices', () => {
  it('shows the token once and lists devices without it', async () => {
    const cookie = await signIn();
    const { device, token } = await register(cookie, '  Quadro  ');
    expect(token.startsWith(DEVICE_TOKEN_PREFIX)).toBe(true);
    expect(token.length).toBeGreaterThan(40);

    const list = await (await asUser(cookie, 'GET', '/v1/devices')).json();
    expect(list).toEqual({
      devices: [
        {
          id: device.id,
          name: 'Quadro',
          model: null,
          firmware: null,
          scriptVersion: null,
          createdAt: clock,
          lastSeenAt: null,
        },
      ],
    });
    expect(JSON.stringify(list)).not.toContain(token);
    const stored = db.prepare('SELECT token_hash FROM devices').get() as { token_hash: string };
    expect(stored.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.token_hash).not.toContain(token);
  });

  it('needs a session, the app origin and a valid name', async () => {
    const cookie = await signIn();
    expect((await app.request(`${ORIGIN}/v1/devices`)).status).toBe(401);
    const foreign = await app.request(`${ORIGIN}/v1/devices`, {
      method: 'POST',
      headers: { Origin: 'https://evil.example', Cookie: cookie },
      body: JSON.stringify({ name: 'X' }),
    });
    expect(foreign.status).toBe(403);
    expect((await asUser(cookie, 'POST', '/v1/devices', { name: ' ' })).status).toBe(400);
    expect((await asUser(cookie, 'POST', '/v1/devices', { name: 'x'.repeat(61) })).status).toBe(
      400,
    );
  });

  it('revokes a device: its token stops working and it leaves the list', async () => {
    const cookie = await signIn();
    const { device, token } = await register(cookie);
    expect((await asUser(cookie, 'DELETE', `/v1/devices/${device.id}`)).status).toBe(204);
    expect(await (await asUser(cookie, 'GET', '/v1/devices')).json()).toEqual({ devices: [] });
    expect((await send(token, payload([minute(MINUTE)]))).status).toBe(401);
  });

  it('keeps households apart', async () => {
    const { device, token } = await register(await signIn());
    const other = await signIn('rui@example.pt');
    expect(await (await asUser(other, 'GET', '/v1/devices')).json()).toEqual({ devices: [] });
    await asUser(other, 'DELETE', `/v1/devices/${device.id}`);
    expect((await send(token, payload([minute(MINUTE)]))).status).toBe(200);
  });
});

describe('POST /v1/ingest', () => {
  let token: string;
  let deviceId: string;

  beforeEach(async () => {
    const registered = await register(await signIn());
    token = registered.token;
    deviceId = registered.device.id;
  });

  it('stores the minute aggregate and the per-second values', async () => {
    const response = await send(token, payload([minute(MINUTE)]));
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({ stored: 1, duplicates: 0, rejected: 0, now: clock });

    const row = db.prepare('SELECT * FROM readings_1m').get() as Record<string, unknown>;
    expect(row).toMatchObject({
      device_id: deviceId,
      channel: 0,
      ts: MINUTE,
      samples: 60,
      energy_wh: 9,
      power_avg_w: 530,
      power_min_w: 500,
      power_max_w: 559,
      voltage_min_dv: 2300,
      voltage_avg_dv: 2330,
      voltage_max_dv: 2359,
      pf_avg_pct: 97,
      // sqrt(559² + 120²) = 571,7 VA, at second 59.
      apparent_max_va: 572,
    });
    const blob = db.prepare('SELECT data FROM readings_1s').get() as { data: Uint8Array };
    const decoded = decodeSeconds(new Uint8Array(blob.data));
    expect(decoded.power[59]).toBe(559);
    expect(decoded.nonActive[10]).toBeNull();
    expect(decoded.voltage[0]).toBe(2300);
  });

  it('records a boot once: the outage starts after the last minute before it', async () => {
    clock = MINUTE + 3 * 3600;
    await send(token, payload([minute(MINUTE)]));
    // Booted 10:30 after the minute; its first minute starts before the boot.
    const boot = MINUTE + 3600 + 30;
    const first = { ...payload([minute(MINUTE + 3600)]), sv: '0.2.0', b: boot };
    expect((await send(token, first)).status).toBe(200);
    // Later requests repeat the boot time, a second off: still the same boot.
    await send(token, { ...payload([minute(MINUTE + 3660)]), sv: '0.2.0', b: boot + 1 });
    expect(db.prepare('SELECT device_id, boot_at, start_at, excluded FROM outages').all()).toEqual([
      { device_id: deviceId, boot_at: boot, start_at: MINUTE + 60, excluded: 0 },
    ]);
  });

  it('records a first boot without a start, and ignores a boot in the future', async () => {
    await send(token, { ...payload([minute(MINUTE)]), b: clock + 3600 });
    expect(count('outages')).toBe(0);
    await send(token, { ...payload([minute(MINUTE)]), b: MINUTE - 500 });
    expect(db.prepare('SELECT start_at FROM outages').all()).toEqual([{ start_at: null }]);
  });

  it('records what the device reported', async () => {
    await send(token, payload([minute(MINUTE)]));
    const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(deviceId) as Record<
      string,
      unknown
    >;
    expect(device).toMatchObject({
      last_seen_at: clock,
      model: 'S3EM-002CXCEU',
      firmware: '1.4.4',
      script_version: '0.1.0',
    });
    // Without m/fw the known values stay.
    await send(token, { v: 1, sv: '0.1.1', min: [minute(MINUTE + 60)] });
    expect(db.prepare('SELECT model, script_version FROM devices').get()).toEqual({
      model: 'S3EM-002CXCEU',
      script_version: '0.1.1',
    });
  });

  it('treats a resend as duplicates, never as new rows', async () => {
    await send(token, payload([minute(MINUTE - 60), minute(MINUTE)]));
    const again = await send(token, payload([minute(MINUTE), minute(MINUTE - 60, { e: 99 })]));
    expect(await again.json()).toEqual({ stored: 0, duplicates: 2, rejected: 0, now: clock });
    expect(count('readings_1m')).toBe(2);
    expect(count('readings_1s')).toBe(2);
    // The first value stays.
    expect(db.prepare('SELECT energy_wh FROM readings_1m WHERE ts = ?').get(MINUTE - 60)).toEqual({
      energy_wh: 9,
    });
  });

  it('accepts late batches out of order and separate channels', async () => {
    const response = await send(
      token,
      payload([
        minute(MINUTE),
        minute(MINUTE - 3600),
        minute(MINUTE, { c: 1 }),
        minute(MINUTE - 120),
      ]),
    );
    expect(await response.json()).toEqual({ stored: 4, duplicates: 0, rejected: 0, now: clock });
  });

  it('adds the per-second values later if the first send had the aggregate only', async () => {
    expect(await (await send(token, payload([aggregate(MINUTE)]))).json()).toEqual({
      stored: 1,
      duplicates: 0,
      rejected: 0,
      now: clock,
    });
    expect(count('readings_1s')).toBe(0);
    expect(db.prepare('SELECT apparent_max_va FROM readings_1m').get()).toEqual({
      apparent_max_va: null,
    });
    await send(token, payload([minute(MINUTE)]));
    expect(count('readings_1s')).toBe(1);
    expect(db.prepare('SELECT apparent_max_va FROM readings_1m').get()).toEqual({
      apparent_max_va: 572,
    });
  });

  it('rejects bad minutes one by one and stores the rest', async () => {
    const bad = [
      minute(MINUTE + 30), // not on a minute boundary
      minute(MINUTE + 240), // too far in the future
      minute(clock - MAX_AGE_SECONDS - 120), // too old
      minute(MINUTE, { pn: 600 }), // min above avg
      minute(MINUTE, { p: seconds(() => 1.5) }), // not integers
      minute(MINUTE, { q: undefined }), // per-second series must come together
      minute(MINUTE, { u: [2300] }), // not 60 values
      minute(MINUTE, { e: -1 }),
      minute(MINUTE, { c: 4 }),
      'nonsense',
    ];
    const response = await send(token, payload([...bad, minute(MINUTE + 60)]));
    expect(await response.json()).toEqual({
      stored: 1,
      duplicates: 0,
      rejected: bad.length,
      now: clock,
    });
    expect(count('readings_1m')).toBe(1);
  });

  it('accepts a minute slightly ahead of the server clock', async () => {
    const response = await send(token, payload([minute(MINUTE + 120)]));
    expect(await response.json()).toEqual({ stored: 1, duplicates: 0, rejected: 0, now: clock });
  });

  it('refuses an invalid envelope', async () => {
    for (const body of [
      'not json',
      { v: 2, sv: '0.1.0', min: [minute(MINUTE)] },
      { v: 1, min: [minute(MINUTE)] },
      { v: 1, sv: '0.1.0', min: [] },
      { v: 1, sv: '0.1.0', min: Array.from({ length: 21 }, (_, i) => aggregate(MINUTE - 60 * i)) },
    ]) {
      const response = await send(token, body);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'invalid_payload' });
    }
    expect(count('readings_1m')).toBe(0);
  });

  it('refuses a missing or wrong token', async () => {
    const anonymous = await app.request(`${ORIGIN}/v1/ingest`, {
      method: 'POST',
      body: JSON.stringify(payload([minute(MINUTE)])),
    });
    expect(anonymous.status).toBe(401);
    expect((await send(`${token}x`, payload([minute(MINUTE)]))).status).toBe(401);
    expect((await send('', payload([minute(MINUTE)]))).status).toBe(401);
    expect(count('readings_1m')).toBe(0);
  });

  it('refuses a payload above the size limit', async () => {
    const big = JSON.stringify({ ...payload([minute(MINUTE)]), pad: 'x'.repeat(MAX_INGEST_BYTES) });
    const response = await send(token, big);
    expect(response.status).toBe(413);
    expect(count('readings_1m')).toBe(0);
  });

  it('limits requests per device and minute', async () => {
    for (let i = 0; i < LIMIT; i++) {
      expect((await send(token, payload([minute(MINUTE - 60 * i)]))).status).toBe(200);
    }
    const limited = await send(token, payload([minute(MINUTE - 600)]));
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBe('45');
    expect(count('readings_1m')).toBe(LIMIT);

    clock = MINUTE + 120;
    expect((await send(token, payload([minute(MINUTE - 600)]))).status).toBe(200);
  });

  it('stores nothing when the batch fails halfway', async () => {
    // A device row deleted under the request: the foreign key fails the batch.
    db.exec('PRAGMA foreign_keys = OFF');
    db.prepare('UPDATE devices SET household_id = ? WHERE id = ?').run('gone', deviceId);
    db.exec('PRAGMA foreign_keys = ON');
    const response = await send(token, payload([minute(MINUTE - 60), minute(MINUTE)]));
    expect(response.status).toBe(500);
    expect(count('readings_1m')).toBe(0);
    expect(count('readings_1s')).toBe(0);
  });
});

describe('backfill from the Shelly’s minute log', () => {
  let token: string;

  beforeEach(async () => {
    token = (await register(await signIn())).token;
  });

  const missing = (query: string, bearer = token) =>
    app.request(`${ORIGIN}/v1/ingest/missing?${query}`, {
      headers: { Authorization: `Bearer ${bearer}` },
    });

  it('says which minutes of a channel are not stored', async () => {
    const from = MINUTE - 600;
    clock = MINUTE + 75;
    await send(token, payload([minute(from + 120), minute(from + 180), minute(from + 420)]));
    const response = await missing(`c=0&from=${from}&to=${MINUTE}`);
    expect(await response.json()).toEqual({
      missing: [
        [from, from + 120],
        [from + 240, from + 420],
        [from + 480, MINUTE],
      ],
      now: clock,
    });
    // Another channel: all of it.
    expect(
      ((await (await missing(`c=1&from=${from}&to=${MINUTE}`)).json()) as { missing: unknown })
        .missing,
    ).toEqual([[from, MINUTE]]);
    // Only the oldest gap, as the script asks.
    expect(
      (
        (await (await missing(`c=0&from=${from}&to=${MINUTE}&limit=1`)).json()) as {
          missing: unknown;
        }
      ).missing,
    ).toEqual([[from, from + 120]]);
  });

  it('wants a device token, whole minutes and at most 11 days', async () => {
    expect((await missing(`c=0&from=${MINUTE - 600}&to=${MINUTE}`, 'wm_dev_wrong')).status).toBe(
      401,
    );
    expect((await missing(`c=0&from=${MINUTE - 590}&to=${MINUTE}`)).status).toBe(400);
    expect((await missing(`c=0&from=${MINUTE - 12 * 86_400}&to=${MINUTE}`)).status).toBe(400);
    expect((await missing(`c=0&from=${MINUTE}&to=${MINUTE + 3600}`)).status).toBe(400);
  });

  it('keeps the apparent peak of a minute without per-second values', async () => {
    await send(token, payload([{ ...aggregate(MINUTE), sx: 640 }]));
    const row = db.prepare('SELECT apparent_max_va FROM readings_1m').get() as {
      apparent_max_va: number | null;
    };
    expect(row.apparent_max_va).toBe(640);
  });

  it('moves the rollups back for minutes older than they recompute', async () => {
    const household = (
      db.prepare("SELECT id FROM households WHERE name = 'Casa'").get() as { id: string }
    ).id;
    const name = `rollup_until:${household}`;
    db.prepare('INSERT INTO maintenance_state (name, value) VALUES (?, ?)').run(name, clock);
    const old = MINUTE - 2 * 86_400;
    await send(token, payload([aggregate(old)]));
    const state = () =>
      (
        db.prepare('SELECT value FROM maintenance_state WHERE name = ?').get(name) as {
          value: number;
        }
      ).value;
    // The next run starts LATE_SECONDS (6 h) before the state: at the old minute.
    expect(state()).toBe(old + 6 * 3600);
    // A recent minute leaves it alone; so does the same old minute again.
    await send(token, payload([aggregate(MINUTE), aggregate(old)]));
    expect(state()).toBe(old + 6 * 3600);
  });
});
