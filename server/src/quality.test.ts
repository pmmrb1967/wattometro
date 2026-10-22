// SPDX-License-Identifier: AGPL-3.0-or-later
import type { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { memorySql } from '../test/sqlite';
import { createApp } from './app';
import type { Sql } from './db';
import { hashPassword } from './password';
import { createDevice } from './repo/devices';
import { createHousehold } from './repo/households';
import { bootStatement } from './repo/quality';
import { minuteStatements } from './repo/readings';
import { createUser } from './repo/users';
import { runMaintenance } from './rollups';

const ORIGIN = 'https://app.example';
const PASSWORD = 'uma password comprida';
const at = (iso: string) => Date.parse(iso) / 1000;
const START = at('2026-07-15T09:00:00Z');
const NOW = START + 86_400;

let app: ReturnType<typeof createApp>;
let sql: Sql;
let db: DatabaseSync;
const households: { id: string; deviceId: string }[] = [];

beforeEach(async () => {
  const memory = memorySql();
  sql = memory.sql;
  db = memory.db;
  households.length = 0;
  app = createApp({ sql, sessionSecret: 's'.repeat(32), allowedOrigins: [], now: () => NOW });
  for (const [email, home] of [
    ['ana@example.pt', 'Casa'],
    ['rui@example.pt', 'Outra'],
  ] as const) {
    const id = (await createHousehold(sql, home, 0)).id;
    const passwordHash = await hashPassword(PASSWORD, 1000);
    await createUser(sql, { householdId: id, email, passwordHash }, 0);
    const tokenHash = email.padEnd(64, 'x');
    const device = await createDevice(sql, { householdId: id, name: 'Quadro', tokenHash }, 0);
    households.push({ id, deviceId: device.id });
  }
});

async function signIn(email = 'ana@example.pt') {
  const response = await app.request(`${ORIGIN}/v1/auth/login`, {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const value = /__Host-wm_session=([^;]+)/.exec(response.headers.get('Set-Cookie') ?? '')?.[1];
  return `__Host-wm_session=${value}`;
}

const request = (cookie: string, method: string, path: string, body?: unknown) =>
  app.request(`${ORIGIN}${path}`, {
    method,
    headers: { Origin: ORIGIN, Cookie: cookie, 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

async function minute(index: number, ts: number, minDv: number, maxDv: number) {
  const household = households[index]!;
  await sql.batch(
    minuteStatements(
      { id: household.deviceId, householdId: household.id },
      {
        ts,
        channel: 0,
        samples: 60,
        energyWh: 1,
        powerAvgW: 60,
        powerMinW: 50,
        powerMaxW: 70,
        voltageMinDv: minDv,
        voltageAvgDv: Math.round((minDv + maxDv) / 2),
        voltageMaxDv: maxDv,
        pfAvgPct: 95,
        seconds: null,
      },
    ),
  );
}

describe('GET /v1/quality', () => {
  it('returns the 10-minute voltage and the minutes outside the limits, per household', async () => {
    await minute(0, START, 2300, 2320);
    await minute(0, START + 60, 2050, 2300);
    await minute(0, START + 120, 2300, 2560);
    await minute(1, START, 1000, 3000);
    await runMaintenance(sql, START + 3600);

    const cookie = await signIn();
    const response = await request(
      cookie,
      'GET',
      `/v1/quality?from=${START}&to=${START + 3600}&low=2070&high=2530`,
    );
    expect(response.status).toBe(200);
    const meter = `${households[0]!.deviceId}:0`;
    // Averages 2310, 2175 and 2430 → 2305.
    expect(await response.json()).toEqual({
      zone: null,
      devices: [{ id: households[0]!.deviceId, name: 'Quadro' }],
      intervals: [{ meter, intervals: [[START, 3, 2305, 2050, 2560]] }],
      outside: [
        {
          meter,
          minutes: [
            [START + 60, 2050, 2300],
            [START + 120, 2300, 2560],
          ],
        },
      ],
      outsideTruncated: false,
    });
  });

  it('refuses a missing or too long period', async () => {
    const cookie = await signIn();
    expect((await request(cookie, 'GET', '/v1/quality?from=0&to=1')).status).toBe(400);
    const tooLong = `/v1/quality?from=0&to=${94 * 86_400}&low=2070&high=2530`;
    expect((await request(cookie, 'GET', tooLong)).status).toBe(400);
  });
});

describe('zone and outages', () => {
  it('saves the zone', async () => {
    const cookie = await signIn();
    expect((await request(cookie, 'PUT', '/v1/quality/zone', { zone: 'B' })).status).toBe(204);
    expect((await request(cookie, 'PUT', '/v1/quality/zone', { zone: 'D' })).status).toBe(400);
    const quality = await request(cookie, 'GET', '/v1/quality?from=0&to=10&low=2070&high=2530');
    expect(((await quality.json()) as { zone: string }).zone).toBe('B');
  });

  it('lists the outages and lets the user exclude one, in their household only', async () => {
    for (const [index, household] of households.entries()) {
      await minute(index, START, 2300, 2310);
      await sql.batch([
        bootStatement({ id: household.deviceId, householdId: household.id }, START + 400),
      ]);
    }
    const cookie = await signIn();
    const list = await request(cookie, 'GET', `/v1/outages?from=${START}&to=${NOW}`);
    const { deviceId } = households[0]!;
    expect(await list.json()).toEqual({
      outages: [{ deviceId, bootAt: START + 400, startAt: START + 60, excluded: false }],
    });

    const other = households[1]!.deviceId;
    await request(cookie, 'PUT', `/v1/outages/${other}/${START + 400}`, { excluded: true });
    await request(cookie, 'PUT', `/v1/outages/${deviceId}/${START + 400}`, { excluded: true });
    expect(db.prepare('SELECT device_id, excluded FROM outages ORDER BY excluded').all()).toEqual([
      { device_id: other, excluded: 0 },
      { device_id: deviceId, excluded: 1 },
    ]);
  });
});
