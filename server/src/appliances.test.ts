// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'vitest';
import { memorySql } from '../test/sqlite';
import { createApp } from './app';
import type { Sql } from './db';
import { hashPassword } from './password';
import { MAX_APPLIANCES } from './repo/appliances';
import { createHousehold } from './repo/households';
import { createUser } from './repo/users';

const ORIGIN = 'https://app.example';
const PASSWORD = 'uma password comprida';
const NOW = Date.parse('2026-10-26T12:00:00Z') / 1000;
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

const FRIDGE = {
  label: 'Frigorífico',
  powerW: 104,
  statesW: [98],
  pulsing: false,
  minDurationS: 540,
  maxDurationS: 2160,
  heats: null,
};

const DISHWASHER = {
  label: 'Máquina da loiça',
  powerW: 2033,
  statesW: [1998],
  pulsing: false,
  minDurationS: 1552,
  maxDurationS: 6212,
  heats: 4,
};

describe('/v1/appliances', () => {
  it('creates, lists, renames and deletes, per household', async () => {
    const ana = await signIn(0);
    const rui = await signIn(1);
    const created = await request(ana, 'POST', '/v1/appliances', FRIDGE);
    expect(created.status).toBe(201);
    const { appliance } = (await created.json()) as { appliance: { id: string } };
    expect(appliance).toMatchObject({ ...FRIDGE, createdAt: NOW });

    const list = async (cookie: string) =>
      ((await (await request(cookie, 'GET', '/v1/appliances')).json()) as { appliances: unknown[] })
        .appliances;
    expect(await list(ana)).toEqual([{ ...FRIDGE, id: appliance.id, createdAt: NOW }]);
    expect(await list(rui)).toEqual([]);

    // Another household can neither rename nor delete it.
    const path = `/v1/appliances/${appliance.id}`;
    expect((await request(rui, 'PATCH', path, { label: 'Arca' })).status).toBe(404);
    await request(rui, 'DELETE', path);
    expect((await request(ana, 'PATCH', path, { label: ' Arca ' })).status).toBe(204);
    expect(await list(ana)).toMatchObject([{ label: 'Arca' }]);
    // Another programme widens the durations; the label stays.
    const durations = { minS: 300, maxS: 2400 };
    expect((await request(ana, 'PATCH', path, { durations })).status).toBe(204);
    expect(await list(ana)).toMatchObject([
      { label: 'Arca', minDurationS: 300, maxDurationS: 2400 },
    ]);
    expect((await request(ana, 'DELETE', path)).status).toBe(204);
    expect(await list(ana)).toEqual([]);
  });

  it('refuses what is not a descriptor, and more than the limit', async () => {
    const ana = await signIn(0);
    for (const bad of [
      { ...FRIDGE, label: ' ' },
      { ...FRIDGE, statesW: [] },
      { ...FRIDGE, powerW: 12.5 },
      { ...FRIDGE, pulsing: 'no' },
      { ...FRIDGE, minDurationS: null },
      { ...FRIDGE, minDurationS: 3000 },
      { ...FRIDGE, heats: 0 },
      { ...FRIDGE, heats: 2.5 },
    ]) {
      expect((await request(ana, 'POST', '/v1/appliances', bad)).status).toBe(400);
    }
    for (let index = 0; index < MAX_APPLIANCES; index++) {
      await request(ana, 'POST', '/v1/appliances', { ...FRIDGE, label: `A${index}` });
    }
    expect((await request(ana, 'POST', '/v1/appliances', FRIDGE)).status).toBe(409);
  });

  it('keeps the heatings of a whole programme (migration 0018)', async () => {
    const ana = await signIn(0);
    expect((await request(ana, 'POST', '/v1/appliances', DISHWASHER)).status).toBe(201);
    const { appliances } = (await (await request(ana, 'GET', '/v1/appliances')).json()) as {
      appliances: unknown[];
    };
    expect(appliances).toMatchObject([DISHWASHER]);
  });

  it('accepts an appliance without durations (named before migration 0017)', async () => {
    const ana = await signIn(0);
    const { label, powerW, statesW, pulsing } = FRIDGE;
    const old = { label, powerW, statesW, pulsing };
    const created = await request(ana, 'POST', '/v1/appliances', old);
    expect(await created.json()).toMatchObject({
      appliance: { minDurationS: null, maxDurationS: null, heats: null },
    });
    // A change must change something.
    expect((await request(ana, 'PATCH', '/v1/appliances/x', {})).status).toBe(400);
  });

  it('needs a session', async () => {
    expect((await app.request(`${ORIGIN}/v1/appliances`)).status).toBe(401);
  });
});
