// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'vitest';
import { memorySql } from '../test/sqlite';
import { createApp } from './app';
import type { Sql } from './db';
import { hashPassword } from './password';
import { createDevice } from './repo/devices';
import { purgeVisits, recordVisit, visitsSince } from './repo/admin';
import { createHousehold } from './repo/households';
import { addUsage, usageSince } from './repo/usage';
import { createUser } from './repo/users';

const ORIGIN = 'https://app.example';
const PASSWORD = 'uma password comprida';
// 10:30 in Lisbon (summer time).
const NOW = Date.parse('2026-07-15T09:30:00Z') / 1000;

let app: ReturnType<typeof createApp>;
let sql: Sql;

beforeEach(async () => {
  sql = memorySql().sql;
  app = createApp({
    sql,
    sessionSecret: 's'.repeat(32),
    allowedOrigins: [],
    now: () => NOW,
    adminEmails: ['admin@example.pt'],
  });
  const id = (await createHousehold(sql, 'Casa', 0)).id;
  for (const email of ['Admin@example.pt', 'ana@example.pt']) {
    const passwordHash = await hashPassword(PASSWORD, 1000);
    await createUser(sql, { householdId: id, email, passwordHash }, 0);
  }
  await createDevice(sql, { householdId: id, name: 'Quadro', tokenHash: 'x'.repeat(64) }, 0);
});

async function signIn(email: string) {
  const response = await app.request(`${ORIGIN}/v1/auth/login`, {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const value = /__Host-wm_session=([^;]+)/.exec(response.headers.get('Set-Cookie') ?? '')?.[1];
  return `__Host-wm_session=${value}`;
}

const call = (cookie: string, method: string, path: string, body?: unknown) =>
  app.request(`${ORIGIN}${path}`, {
    method,
    headers: { Origin: ORIGIN, Cookie: cookie, 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

describe('the administrator', () => {
  it('is told so, and only they get the server totals', async () => {
    const admin = await signIn('Admin@example.pt');
    const ana = await signIn('ana@example.pt');
    expect((await (await call(admin, 'GET', '/v1/auth/me')).json()).admin).toBe(true);
    expect((await (await call(ana, 'GET', '/v1/auth/me')).json()).admin).toBe(false);
    expect((await call(ana, 'GET', '/v1/admin/stats')).status).toBe(403);

    await addUsage(sql, '2026-07-15', 1200, 30);
    await addUsage(sql, '2026-07-15', 800, 0);
    const response = await call(admin, 'GET', '/v1/admin/stats');
    expect(response.status).toBe(200);
    const stats = await response.json();
    expect(stats).toMatchObject({
      limits: { rowsRead: 5_000_000, rowsWritten: 100_000 },
      days: [{ day: '2026-07-15', rowsRead: 2000, rowsWritten: 30 }],
      accounts: { users: 2, households: 1, pushDevices: 0 },
      devices: [{ model: null, lastSeenAt: null, minutesToday: 0, expectedToday: 630 }],
    });
    // Totals only: nothing that names a person or the house.
    expect(JSON.stringify(stats)).not.toMatch(/example\.pt|Casa|Quadro/);
  });

  it('sees the visits per page, which any user adds to', async () => {
    const admin = await signIn('Admin@example.pt');
    const ana = await signIn('ana@example.pt');
    for (const page of ['/', '/', '/potencia']) {
      expect((await call(ana, 'POST', '/v1/visit', { page })).status).toBe(204);
    }
    expect((await call(ana, 'POST', '/v1/visit', { page: '/admin?x' })).status).toBe(400);
    const { visits } = await (await call(admin, 'GET', '/v1/admin/stats')).json();
    expect(visits).toEqual({
      days: 30,
      pages: [
        { page: '/', today: 2, total: 2 },
        { page: '/potencia', today: 1, total: 1 },
      ],
    });
  });
});

describe('usage per day', () => {
  it('keeps rows read and written apart, oldest day first', async () => {
    await addUsage(sql, '2026-07-14', 10, 0);
    await addUsage(sql, '2026-07-15', 5, 7);
    await addUsage(sql, '2026-07-13', 1, 1);
    expect(await usageSince(sql, '2026-07-14')).toEqual([
      { day: '2026-07-14', rowsRead: 10, rowsWritten: 0 },
      { day: '2026-07-15', rowsRead: 5, rowsWritten: 7 },
    ]);
  });
});

describe('visits (migration 0022)', () => {
  it('counts one row a page a day and forgets the old days', async () => {
    await recordVisit(sql, '2026-04-01', '/');
    await recordVisit(sql, '2026-07-15', '/');
    await recordVisit(sql, '2026-07-15', '/');
    await purgeVisits(sql, '2026-04-17');
    expect(await visitsSince(sql, '2026-01-01', '2026-07-15')).toEqual([
      { page: '/', today: 2, total: 2 },
    ]);
  });
});
