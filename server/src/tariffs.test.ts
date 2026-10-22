// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'vitest';
import { memorySql } from '../test/sqlite';
import { createApp } from './app';
import type { Sql } from './db';
import { hashPassword } from './password';
import { createHousehold } from './repo/households';
import { createUser } from './repo/users';

const ORIGIN = 'https://app.example';
const PASSWORD = 'uma password comprida';

let app: ReturnType<typeof createApp>;
let sql: Sql;

beforeEach(async () => {
  sql = memorySql().sql;
  app = createApp({
    sql,
    sessionSecret: 's'.repeat(32),
    allowedOrigins: [],
    now: () => 1_792_000_000,
  });
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

const request = (cookie: string, method: string, path: string, body?: unknown, origin = ORIGIN) =>
  app.request(`${ORIGIN}${path}`, {
    method,
    headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

const TARIFF = {
  validFrom: '2026-10-01',
  supplier: 'Teste',
  powerVa: 6900,
  option: 'tri',
  cycle: 'weekly',
  periodsMap: 'pre-2027',
  fixedPerDay: 343_600,
  energy: { peak: 250_000, full: 180_000, empty: 100_000 },
  iecPerKwh: 1_000,
  cavPerMonth: 2_850_000,
  dgegPerMonth: 70_000,
  largeFamily: true,
};

const list = async (cookie: string) =>
  ((await (await request(cookie, 'GET', '/v1/tariffs')).json()) as { tariffs: unknown[] }).tariffs;

describe('/v1/tariffs', () => {
  it('saves a contract and lists it back, oldest first', async () => {
    const cookie = await signIn();
    const created = await request(cookie, 'POST', '/v1/tariffs', TARIFF);
    expect(created.status).toBe(201);
    const { tariff } = (await created.json()) as { tariff: { id: string } };
    expect(tariff).toEqual({ ...TARIFF, id: expect.any(String) });

    await request(cookie, 'POST', '/v1/tariffs', {
      ...TARIFF,
      validFrom: '2026-01-01',
      option: 'simple',
      energy: { simple: 166_500 },
      supplier: null,
      largeFamily: false,
    });
    expect(await list(cookie)).toEqual([
      expect.objectContaining({ validFrom: '2026-01-01', energy: { simple: 166_500 } }),
      { ...TARIFF, id: tariff.id },
    ]);
  });

  it('replaces the contract that starts on the same day', async () => {
    const cookie = await signIn();
    await request(cookie, 'POST', '/v1/tariffs', TARIFF);
    await request(cookie, 'POST', '/v1/tariffs', { ...TARIFF, fixedPerDay: 400_000 });
    const tariffs = await list(cookie);
    expect(tariffs).toHaveLength(1);
    expect(tariffs[0]).toMatchObject({ fixedPerDay: 400_000 });
  });

  it('rejects a contract without the prices of its option', async () => {
    const cookie = await signIn();
    const response = await request(cookie, 'POST', '/v1/tariffs', { ...TARIFF, energy: {} });
    expect(response.status).toBe(400);
  });

  it('keeps households apart', async () => {
    const ana = await signIn();
    const rui = await signIn('rui@example.pt');
    const { tariff } = (await (await request(ana, 'POST', '/v1/tariffs', TARIFF)).json()) as {
      tariff: { id: string };
    };
    expect(await list(rui)).toEqual([]);
    expect((await request(rui, 'DELETE', `/v1/tariffs/${tariff.id}`)).status).toBe(204);
    expect(await list(ana)).toHaveLength(1);
    expect((await request(ana, 'DELETE', `/v1/tariffs/${tariff.id}`)).status).toBe(204);
    expect(await list(ana)).toEqual([]);
  });

  it('needs a session and the app origin for writes', async () => {
    const cookie = await signIn();
    expect((await app.request(`${ORIGIN}/v1/tariffs`)).status).toBe(401);
    const foreign = await request(cookie, 'POST', '/v1/tariffs', TARIFF, 'https://evil.example');
    expect(foreign.status).toBe(403);
  });
});
