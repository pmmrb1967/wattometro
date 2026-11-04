// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The same /v1 routes answer in three places (CLAUDE.md, "Modo sem conta"): the
 * Worker (app.ts), the browser for a house without an account
 * (src/local/server.ts) and the demonstration (src/demo/server.ts). Each
 * scenario here runs against all three, so that a rule added to one and
 * forgotten in another fails a test instead of reaching a user.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { demoResponse, resetDemo } from '../../src/demo/server';
import { createLocalServer } from '../../src/local/server';
import { memoryStore } from '../../src/local/store';
import { memorySql } from '../test/sqlite';
import { createApp } from './app';
import { hashPassword } from './password';
import { createHousehold } from './repo/households';
import { createUser } from './repo/users';

type Api = (method: string, path: string, body?: unknown) => Promise<Response>;

const ORIGIN = 'https://app.example';
const PASSWORD = 'uma password comprida';
const NOW = Date.parse('2026-11-04T09:00:00Z') / 1000;

async function worker(): Promise<Api> {
  const { sql } = memorySql();
  const app = createApp({ sql, sessionSecret: 's'.repeat(32), allowedOrigins: [], now: () => NOW });
  const email = 'ana@example.pt';
  const householdId = (await createHousehold(sql, 'Casa', 0)).id;
  await createUser(
    sql,
    { householdId, email, passwordHash: await hashPassword(PASSWORD, 1000) },
    0,
  );
  const login = await app.request(`${ORIGIN}/v1/auth/login`, {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const cookie = /__Host-wm_session=[^;]+/.exec(login.headers.get('Set-Cookie') ?? '')?.[0] ?? '';
  return async (method, path, body) =>
    app.request(`${ORIGIN}${path}`, {
      method,
      headers: { Origin: ORIGIN, Cookie: cookie, 'Content-Type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
}

const local = (): Promise<Api> => {
  const server = createLocalServer(memoryStore(), () => NOW);
  return Promise.resolve((method, path, body) => server.respond(method, path, body));
};

const demo = (): Promise<Api> => {
  resetDemo();
  return Promise.resolve((method, path, body) => Promise.resolve(demoResponse(method, path, body)));
};

const SERVERS: [string, () => Promise<Api>][] = [
  ['the Worker', worker],
  ['the local mode', local],
  ['the demonstration', demo],
];

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

interface Item {
  id: string;
  name: string;
  estimate: unknown;
}

/** A contract starting far ahead, so that it never meets one a server already has. */
const TARIFF = {
  validFrom: '2030-01-01',
  supplier: 'Teste',
  powerVa: 6900,
  option: 'simple',
  cycle: 'daily',
  periodsMap: 'pre-2027',
  fixedPerDay: 400_000,
  energy: { simple: 160_000 },
  iecPerKwh: 1000,
  cavPerMonth: 2_850_000,
  dgegPerMonth: 70_000,
  largeFamily: false,
  energyDiscountBp: 0,
  socialEnergyPerKwh: 0,
  socialPowerPerDay: 0,
  socialFinancingPerKwh: 0,
};

const KETTLE = {
  name: 'Chaleira de teste',
  kind: 'kettle',
  brand: null,
  model: null,
  room: null,
  ratedPowerW: 2200,
  energyClass: null,
  notes: null,
  programmes: [],
};

describe.each(SERVERS)('%s', (_name, start) => {
  let api: Api;
  beforeEach(async () => {
    api = await start();
  });

  it('keeps the equipment register by the same rules', async () => {
    const created = await api('POST', '/v1/equipment', KETTLE);
    expect(created.status).toBe(201);
    const { item } = await json<{ item: Item }>(created);
    expect(item).toMatchObject({ name: KETTLE.name, estimate: null });

    const again = await api('POST', '/v1/equipment', { ...KETTLE, name: ' CHALEIRA DE TESTE ' });
    expect(again.status).toBe(409);
    expect(await json(again)).toEqual({ error: 'name_taken' });
    expect((await api('POST', '/v1/equipment', { ...KETTLE, name: '' })).status).toBe(400);

    const path = `/v1/equipment/${item.id}`;
    const estimate = { basis: 'plate', minutesPerDay: 10 };
    expect((await api('PUT', path, { ...KETTLE, estimate })).status).toBe(204);
    // An app from before the estimate sends none: the one stored stays.
    expect((await api('PUT', path, KETTLE)).status).toBe(204);
    const listed = await json<{ items: Item[] }>(await api('GET', '/v1/equipment'));
    expect(listed.items.find((each) => each.id === item.id)?.estimate).toEqual(estimate);

    expect((await api('PUT', '/v1/equipment/nope', KETTLE)).status).toBe(404);
    expect((await api('DELETE', path)).status).toBe(204);
    const after = await json<{ items: Item[] }>(await api('GET', '/v1/equipment'));
    expect(after.items.some((each) => each.id === item.id)).toBe(false);
  });

  it('keeps what stays on by the same rules', async () => {
    const router = { label: 'Router de teste', quantity: 1, powerW: 8, measured: true };
    const created = await api('POST', '/v1/always-on', router);
    expect(created.status).toBe(201);
    const { item } = await json<{ item: { id: string } }>(created);
    // Measured needs a power.
    const unmeasured = { ...router, powerW: null };
    expect((await api('POST', '/v1/always-on', unmeasured)).status).toBe(400);

    const path = `/v1/always-on/${item.id}`;
    expect((await api('PUT', path, { ...router, quantity: 2 })).status).toBe(204);
    const listed = await json<{ items: { id: string; quantity: number }[] }>(
      await api('GET', '/v1/always-on'),
    );
    expect(listed.items.find((each) => each.id === item.id)?.quantity).toBe(2);
    expect((await api('PUT', '/v1/always-on/nope', router)).status).toBe(404);
    expect((await api('DELETE', path)).status).toBe(204);
  });

  it('keeps the monthly budget by the same rules', async () => {
    const budget = { cents: 5000, whPerDay: 8000 };
    expect((await api('PUT', '/v1/household/budget', { budget })).status).toBe(204);
    expect(await json(await api('GET', '/v1/household/budget'))).toEqual({ budget });
    expect((await api('PUT', '/v1/household/budget', { budget: { cents: 1 } })).status).toBe(400);
    expect((await api('PUT', '/v1/household/budget', { budget: null })).status).toBe(204);
    expect(await json(await api('GET', '/v1/household/budget'))).toEqual({ budget: null });
  });

  it('keeps the tariffs by the same rules: one contract a start date', async () => {
    const created = await api('POST', '/v1/tariffs', TARIFF);
    expect(created.status).toBe(201);
    // The same start date replaces that contract (a correction), it does not add one.
    const corrected = { ...TARIFF, energy: { simple: 150_000 } };
    expect((await api('POST', '/v1/tariffs', corrected)).status).toBe(201);
    const listed = await json<{ tariffs: { id: string; validFrom: string; energy: unknown }[] }>(
      await api('GET', '/v1/tariffs'),
    );
    const mine = listed.tariffs.filter((tariff) => tariff.validFrom === TARIFF.validFrom);
    expect(mine).toHaveLength(1);
    expect(mine[0]?.energy).toEqual({ simple: 150_000 });
    expect((await api('POST', '/v1/tariffs', { ...TARIFF, powerVa: 100 })).status).toBe(400);

    expect((await api('DELETE', `/v1/tariffs/${mine[0]?.id}`)).status).toBe(204);
    const after = await json<{ tariffs: { validFrom: string }[] }>(await api('GET', '/v1/tariffs'));
    expect(after.tariffs.some((tariff) => tariff.validFrom === TARIFF.validFrom)).toBe(false);
  });

  it('keeps the locality by the same rules', async () => {
    const location = { name: 'Évora', latitudeCdeg: 3857, longitudeCdeg: -791 };
    expect((await api('PUT', '/v1/household/location', { location })).status).toBe(204);
    expect(await json(await api('GET', '/v1/household/location'))).toEqual({ location });
    const outside = { location: { ...location, latitudeCdeg: 9001 } };
    expect((await api('PUT', '/v1/household/location', outside)).status).toBe(400);
    expect((await api('PUT', '/v1/household/location', { location: null })).status).toBe(204);
    expect(await json(await api('GET', '/v1/household/location'))).toEqual({ location: null });
  });

  it('keeps the installation by the same rules', async () => {
    const installation = {
      heating: ['electric-heaters', 'gas-boiler'],
      airConditioning: true,
      waterHeating: 'gas',
      hob: 'electric',
      solarPanels: false,
      electricCar: null,
    };
    expect((await api('PUT', '/v1/household/installation', { installation })).status).toBe(204);
    // Heating kept in the list's order, whatever order it came in.
    expect(await json(await api('GET', '/v1/household/installation'))).toEqual({
      installation: { ...installation, heating: ['gas-boiler', 'electric-heaters'] },
    });
    const none = { installation: { ...installation, heating: ['none', 'wood'] } };
    expect((await api('PUT', '/v1/household/installation', none)).status).toBe(400);
  });
});
