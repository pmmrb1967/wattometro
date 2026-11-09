// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'vitest';
import { memorySql } from '../test/sqlite';
import type { Sql } from './db';
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
let sql: Sql;

beforeEach(async () => {
  sql = memorySql().sql;
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
    expect(item).toEqual({ ...ROUTER, id: item.id, equipmentId: null, createdAt: NOW });
    expect(await list(ana)).toEqual([item]);
    expect(await list(rui)).toEqual([]);

    // Another household can neither change nor remove it.
    const path = `/v1/always-on/${item.id}`;
    expect((await request(rui, 'PUT', path, TVS)).status).toBe(404);
    await request(rui, 'DELETE', path);
    expect(await list(ana)).toEqual([item]);

    expect((await request(ana, 'PUT', path, TVS)).status).toBe(204);
    expect(await list(ana)).toEqual([{ ...TVS, id: item.id, equipmentId: null, createdAt: NOW }]);

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

describe('/v1/always-on and the register of equipment (migration 0030)', () => {
  const equipment = (name: string) => ({
    name,
    kind: null,
    brand: null,
    model: null,
    room: null,
    ratedPowerW: null,
    energyClass: null,
    notes: null,
    programmes: [],
    estimate: null,
  });
  const listed = async (cookie: string) =>
    (await list(cookie)) as { id: string; label: string; equipmentId: string | null }[];

  it('links an item named as an equipment, which then governs its name', async () => {
    const ana = await signIn();
    const created = await request(ana, 'POST', '/v1/equipment', equipment('Router'));
    const { item: router } = (await created.json()) as { item: { id: string } };
    const added = await request(ana, 'POST', '/v1/always-on', { ...ROUTER, label: ' router ' });
    expect(await added.json()).toMatchObject({ item: { label: 'Router', equipmentId: router.id } });

    // Renaming the equipment renames the item.
    await request(ana, 'PUT', `/v1/equipment/${router.id}`, equipment('Router da fibra'));
    expect(await listed(ana)).toMatchObject([{ label: 'Router da fibra', equipmentId: router.id }]);

    // Renaming the item to another name unlinks it; back to the equipment's links it again.
    const [item] = await listed(ana);
    const path = `/v1/always-on/${item!.id}`;
    await request(ana, 'PUT', path, { ...ROUTER, label: 'Router velho' });
    expect(await listed(ana)).toMatchObject([{ label: 'Router velho', equipmentId: null }]);
    await request(ana, 'PUT', path, { ...ROUTER, label: 'ROUTER DA FIBRA' });
    expect(await listed(ana)).toMatchObject([{ label: 'Router da fibra', equipmentId: router.id }]);

    // Removing the equipment leaves the item, unlinked.
    await request(ana, 'DELETE', `/v1/equipment/${router.id}`);
    expect(await listed(ana)).toMatchObject([{ label: 'Router da fibra', equipmentId: null }]);
  });

  it('links the items already listed when an equipment of their name is registered', async () => {
    const ana = await signIn();
    await request(ana, 'POST', '/v1/always-on', { ...TVS, label: 'Televisão' });
    const created = await request(ana, 'POST', '/v1/equipment', equipment('televisão'));
    const { item } = (await created.json()) as { item: { id: string } };
    expect(await listed(ana)).toMatchObject([{ label: 'televisão', equipmentId: item.id }]);
  });

  it('links on reading what was named as an equipment before the link existed', async () => {
    const ana = await signIn();
    const created = await request(ana, 'POST', '/v1/equipment', equipment('Água quente'));
    const { item } = (await created.json()) as { item: { id: string } };
    await request(ana, 'POST', '/v1/always-on', { ...ROUTER, label: 'Box' });
    // As before 0030: a name in another case (SQLite's lower() would not match "á"), no link.
    await sql.run("UPDATE always_on SET label = 'ÁGUA QUENTE', equipment_id = NULL");
    expect(await listed(ana)).toMatchObject([{ label: 'Água quente', equipmentId: item.id }]);
    const stored = await sql.first<{ equipment_id: string | null }>(
      'SELECT equipment_id FROM always_on',
    );
    expect(stored?.equipment_id).toBe(item.id);
  });

  it('does not link to the equipment of another household', async () => {
    const ana = await signIn(0);
    const rui = await signIn(1);
    await request(rui, 'POST', '/v1/equipment', equipment('Router'));
    await request(ana, 'POST', '/v1/always-on', ROUTER);
    expect(await listed(ana)).toMatchObject([{ label: 'Router', equipmentId: null }]);
  });
});
