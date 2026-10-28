// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'vitest';
import { memorySql } from '../test/sqlite';
import { createApp } from './app';
import type { Sql } from './db';
import { hashPassword } from './password';
import { createHousehold } from './repo/households';
import { createUser } from './repo/users';
import { runMaintenance } from './rollups';

const ORIGIN = 'https://app.example';
const PASSWORD = 'uma password comprida';
const at = (iso: string) => Date.parse(iso) / 1000;
// 10:30 in Lisbon (summer time, UTC+1); the day started at 2026-07-14T23:00Z.
const NOW = at('2026-07-15T09:30:20Z');
const DAY_START = at('2026-07-14T23:00:00Z');

let app: ReturnType<typeof createApp>;
let sql: Sql;

beforeEach(async () => {
  sql = memorySql().sql;
  app = createApp({ sql, sessionSecret: 's'.repeat(32), allowedOrigins: [], now: () => NOW });
  for (const [email, home] of [
    ['ana@example.pt', 'Casa'],
    ['rui@example.pt', 'Outra'],
  ] as const) {
    const householdId = (await createHousehold(sql, home, 0)).id;
    await createUser(
      sql,
      { householdId, email, passwordHash: await hashPassword(PASSWORD, 1000) },
      0,
    );
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

const minute = (t: number, c: number, e: number, px: number) => ({
  t,
  c,
  n: 60,
  e,
  pa: 500,
  pn: 400,
  px,
  va: 2310,
  vn: 2300,
  vx: 2320,
  pf: 95,
});

async function addDevice(cookie: string, name: string, minutes: unknown[]) {
  const created = (await (await request(cookie, 'POST', '/v1/devices', { name })).json()) as {
    device: { id: string };
    token: string;
  };
  if (minutes.length > 0) {
    await app.request(`${ORIGIN}/v1/ingest`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${created.token}` },
      body: JSON.stringify({ v: 1, sv: '0.1.0', min: minutes }),
    });
  }
  return created.device.id;
}

describe('GET /v1/now', () => {
  it('shows the latest minute and today since Lisbon midnight, per meter', async () => {
    const cookie = await signIn();
    const quadro = await addDevice(cookie, 'Quadro', [
      minute(DAY_START - 60, 0, 500, 9000), // 23:59 yesterday: not today
      minute(DAY_START, 0, 3, 1200),
      minute(NOW - 80, 0, 4, 2500),
      minute(DAY_START + 600, 1, 2, 800),
    ]);
    await addDevice(cookie, 'Garagem', []);

    const response = await request(cookie, 'GET', '/v1/now');
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      now: NOW,
      dayStart: DAY_START,
      database: { sizeBytes: null, limitBytes: 500_000_000 },
    });
    // Both devices were created in the same second, so their order is not fixed.
    expect(body.meters).toHaveLength(3);
    expect(body.meters).toEqual(
      expect.arrayContaining([
        {
          deviceId: quadro,
          deviceName: 'Quadro',
          channel: 0,
          lastSeenAt: NOW,
          latest: {
            ts: NOW - 80,
            powerAvgW: 500,
            powerMinW: 400,
            powerMaxW: 2500,
            voltageAvgDv: 2310,
            voltageMinDv: 2300,
            voltageMaxDv: 2320,
            pfAvgPct: 95,
          },
          today: {
            minutes: 2,
            energyWh: 7,
            powerMaxW: 2500,
            // Per quarter hour, by its start: 00:00 and 10:15 in Lisbon.
            quarters: [
              { ts: DAY_START, energyWh: 3 },
              { ts: at('2026-07-15T09:15:00Z'), energyWh: 4 },
            ],
          },
        },
        expect.objectContaining({
          deviceId: quadro,
          channel: 1,
          today: {
            minutes: 1,
            energyWh: 2,
            powerMaxW: 800,
            quarters: [{ ts: DAY_START, energyWh: 2 }],
          },
        }),
        expect.objectContaining({
          deviceName: 'Garagem',
          channel: 0,
          lastSeenAt: null,
          latest: null,
          today: { minutes: 0, energyWh: 0, powerMaxW: null, quarters: [] },
        }),
      ]),
    );
  });

  it('gives the same today once the Cron has rolled the minutes up', async () => {
    const cookie = await signIn();
    await addDevice(cookie, 'Quadro', [
      minute(DAY_START, 0, 3, 1200),
      minute(DAY_START + 960, 0, 5, 3100),
      minute(NOW - 80, 0, 4, 2500),
      minute(DAY_START + 600, 1, 2, 800),
    ]);
    const before = (await (await request(cookie, 'GET', '/v1/now')).json()).meters;
    await runMaintenance(sql, NOW - 400);
    const after = (await (await request(cookie, 'GET', '/v1/now')).json()).meters;
    expect(after).toEqual(before);
    expect(before[0].today.energyWh + before[1].today.energyWh).toBe(14);
  });

  it('reports the database size once the Cron has measured it', async () => {
    const cookie = await signIn();
    await runMaintenance(sql, NOW);
    const body = await (await request(cookie, 'GET', '/v1/now')).json();
    expect(body.database.sizeBytes).toBeGreaterThan(0);
  });

  it('shows only the household of the signed-in user, and needs a session', async () => {
    await addDevice(await signIn(), 'Quadro', [minute(DAY_START, 0, 3, 1200)]);
    const other = await (await request(await signIn('rui@example.pt'), 'GET', '/v1/now')).json();
    expect(other.meters).toEqual([]);
    expect((await app.request(`${ORIGIN}/v1/now`)).status).toBe(401);
  });
});
