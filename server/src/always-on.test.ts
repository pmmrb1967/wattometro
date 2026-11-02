// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'vitest';
import { memorySql } from '../test/sqlite';
import { createApp } from './app';
import { hashPassword } from './password';
import { MAX_ALWAYS_ON } from './repo/always-on';
import { createHousehold } from './repo/households';
import { createUser } from './repo/users';

const ORIGIN = 'https://app.example';
const PASSWORD = 'uma password comprida';
const NOW = Date.parse('2026-11-02T12:00:00Z') / 1000;
const EMAILS = ['ana@example.pt', 'rui@example.pt'];

let app: ReturnType<typeof createApp>;

beforeEach(async () => {
  const { sql } = memorySql();
  app = createApp({ sql, sessionSecret: 's'.repeat(32), allowedOrigins: [], now: () => NOW });
  for (const email of EMAILS) {
    const id = (await createHousehold(sql, email, 0)).id;
    await createUser(
      sql,
      { householdId: id, email, passwordHash: await hashPassword(PASSWORD, 1000) },
      0,
    );
  }
});

async function signIn(index = 0) {
  const response = await app.request(`${ORIGIN}/v1/auth/login`, {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAILS[index], password: PASSWORD }),
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

const ROUTER = { label: 'Router', quantity: 1, powerW: 12, measured: true };
const TVS = { label: 'Televisões em espera', quantity: 5, powerW: null, measured: false };

const list = async (cookie: string) =>
  ((await (await request(cookie, 'GET', '/v1/always-on')).json()) as { items: unknown[] }).items;

describe('/v1/always-on', () => {
  it('adds, lists, changes and removes, per household', async () => {
    const ana = await signIn(0);
    const rui = await signIn(1);
    const created = await request(ana, 'POST', '/v1/always-on', ROUTER);
    expect(created.status).toBe(201);
    const { item } = (await created.json()) as { item: { id: string } };
    expect(item).toEqual({ ...ROUTER, id: item.id, createdAt: NOW });
    expect(await list(ana)).toEqual([item]);
    expect(await list(rui)).toEqual([]);

    // Another household can neither change nor remove it.
    const path = `/v1/always-on/${item.id}`;
    expect((await request(rui, 'PUT', path, TVS)).status).toBe(404);
    await request(rui, 'DELETE', path);
    expect(await list(ana)).toEqual([item]);

    expect((await request(ana, 'PUT', path, TVS)).status).toBe(204);
    expect(await list(ana)).toEqual([{ ...TVS, id: item.id, createdAt: NOW }]);

    expect((await request(ana, 'DELETE', path)).status).toBe(204);
    expect(await list(ana)).toEqual([]);
  });

  it('takes a name without a power', async () => {
    const ana = await signIn();
    expect((await request(ana, 'POST', '/v1/always-on', TVS)).status).toBe(201);
    expect(await list(ana)).toMatchObject([TVS]);
  });

  it('refuses what is not valid, and more than a house lists', async () => {
    const ana = await signIn();
    for (const bad of [
      { ...ROUTER, label: ' ' },
      { ...ROUTER, quantity: 0 },
      { ...ROUTER, powerW: 0 },
      { ...ROUTER, powerW: 1.5 },
      { ...TVS, measured: true },
    ]) {
      expect((await request(ana, 'POST', '/v1/always-on', bad)).status).toBe(400);
    }
    for (let index = 0; index < MAX_ALWAYS_ON; index++) {
      await request(ana, 'POST', '/v1/always-on', { ...ROUTER, label: `A${index}` });
    }
    expect((await request(ana, 'POST', '/v1/always-on', ROUTER)).status).toBe(409);
  });

  it('is only for a signed in user', async () => {
    expect((await app.request(`${ORIGIN}/v1/always-on`)).status).toBe(401);
  });
});
