// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'vitest';
import { memorySql } from '../test/sqlite';
import { createApp, MAX_IMPORT_QUARTERS } from './app';
import type { Sql } from './db';
import { hashPassword } from './password';
import { createHousehold } from './repo/households';
import { createUser } from './repo/users';

const ORIGIN = 'https://app.example';
const PASSWORD = 'uma password comprida';
const NOW = Date.parse('2026-10-22T12:00:00Z') / 1000;
const utc = (iso: string) => Date.parse(iso) / 1000;

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

/** Every quarter hour in [from, to) with `wh`, the first `estimated` ones estimated. */
function quarters(from: number, to: number, wh: number, estimated = 0) {
  const rows: [number, number, 0 | 1][] = [];
  for (let ts = from; ts < to; ts += 900) rows.push([ts, wh, rows.length < estimated ? 1 : 0]);
  return rows;
}

const daily = (meter = 'eredes') =>
  sql.all<{ day: string; energy_wh: number; source: string }>(
    'SELECT day, energy_wh, source FROM daily WHERE meter = ? ORDER BY day',
    meter,
  );

describe('POST /v1/import/eredes', () => {
  it('stores quarter hours and the Lisbon daily totals, day of 25 h included', async () => {
    const cookie = await signIn();
    // 25/10 00:00 to 27/10 00:00 Lisbon: 24 h + 25 h = 196 quarters (the file would lack 4).
    const from = utc('2025-10-24T23:00:00Z');
    const to = utc('2025-10-27T00:00:00Z');
    const response = await request(cookie, 'POST', '/v1/import/eredes', {
      quarters: quarters(from, to, 100, 2),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ written: 196 });
    expect(await daily()).toEqual([
      { day: '2025-10-25', energy_wh: 9_600, source: 'eredes' },
      { day: '2025-10-26', energy_wh: 10_000, source: 'eredes' },
    ]);

    const summary = await (await request(cookie, 'GET', '/v1/import/eredes')).json();
    expect(summary).toEqual({ quarters: 196, estimated: 2, energyWh: 19_600, from, to });
  });

  it('is idempotent; a changed value replaces the old one and its day', async () => {
    const cookie = await signIn();
    const day = quarters(utc('2026-01-15T00:00:00Z'), utc('2026-01-16T00:00:00Z'), 50);
    await request(cookie, 'POST', '/v1/import/eredes', { quarters: day });
    const again = await request(cookie, 'POST', '/v1/import/eredes', { quarters: day });
    expect(await again.json()).toEqual({ written: 0 });

    const changed = await request(cookie, 'POST', '/v1/import/eredes', {
      quarters: [[utc('2026-01-15T10:00:00Z'), 150, 1]],
    });
    expect(await changed.json()).toEqual({ written: 1 });
    expect(await daily()).toEqual([{ day: '2026-01-15', energy_wh: 4_900, source: 'eredes' }]);
  });

  it('serves the quarter hours as records, and the meters with energy', async () => {
    const cookie = await signIn();
    const from = utc('2026-01-15T00:00:00Z');
    await request(cookie, 'POST', '/v1/import/eredes', {
      quarters: [
        [from, 83, 0],
        [from + 900, 250, 1],
      ],
    });
    const response = await request(
      cookie,
      'GET',
      `/v1/energy/quarters?meter=eredes&from=${from}&to=${from + 3600}`,
    );
    const view = new DataView(await response.arrayBuffer());
    expect(view.byteLength).toBe(16);
    expect([view.getUint32(0, true), view.getUint32(4, true)]).toEqual([from, 83]);
    expect([view.getUint32(8, true), view.getUint32(12, true)]).toEqual([from + 900, 250]);

    const meters = await (
      await request(cookie, 'GET', `/v1/energy?from=${from}&to=${from + 3600}`)
    ).json();
    expect(meters).toEqual({ meters: [{ meter: 'eredes', days: 1, energyWh: 333 }] });

    const days = await (
      await request(cookie, 'GET', `/v1/energy/days?meter=eredes&from=${from}&to=${from + 3600}`)
    ).json();
    expect(days).toEqual({ days: [['2026-01-15', 333]] });
    // Another meter, or days without data: nothing.
    const none = await (
      await request(cookie, 'GET', `/v1/energy/days?meter=x:0&from=${from}&to=${from + 3600}`)
    ).json();
    expect(none).toEqual({ days: [] });
  });

  it('keeps households apart and can remove the import', async () => {
    const ana = await signIn();
    const rui = await signIn('rui@example.pt');
    await request(ana, 'POST', '/v1/import/eredes', {
      quarters: [[utc('2026-01-15T00:00:00Z'), 83, 0]],
    });
    expect(await (await request(rui, 'GET', '/v1/import/eredes')).json()).toMatchObject({
      quarters: 0,
      from: null,
      to: null,
    });
    expect((await request(rui, 'DELETE', '/v1/import/eredes')).status).toBe(204);
    expect(await (await request(ana, 'GET', '/v1/import/eredes')).json()).toMatchObject({
      quarters: 1,
    });
    await request(ana, 'DELETE', '/v1/import/eredes');
    expect(await (await request(ana, 'GET', '/v1/import/eredes')).json()).toMatchObject({
      quarters: 0,
    });
    expect(await daily()).toEqual([]);
  });

  it('rejects what is not an E-Redes quarter hour', async () => {
    const cookie = await signIn();
    const day = utc('2026-01-15T00:00:00Z');
    for (const quarters of [
      [],
      [[day + 60, 10, 0]],
      [[day, -1, 0]],
      [[day, 10, 2]],
      [[NOW + 900, 10, 0]],
      [
        [day, 10, 0],
        [day + 90 * 86_400, 10, 0],
      ],
      Array.from({ length: MAX_IMPORT_QUARTERS + 1 }, (_, index) => [day + index * 900, 1, 0]),
    ]) {
      const response = await request(cookie, 'POST', '/v1/import/eredes', { quarters });
      expect(response.status).toBe(400);
    }
    expect((await app.request(`${ORIGIN}/v1/import/eredes`)).status).toBe(401);
  });
});
