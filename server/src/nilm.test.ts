// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'vitest';
import { memorySql } from '../test/sqlite';
import { createApp } from './app';
import type { Sql } from './db';
import { hashPassword } from './password';
import { createDevice } from './repo/devices';
import { createHousehold } from './repo/households';
import { createUser } from './repo/users';

const ORIGIN = 'https://app.example';
const PASSWORD = 'uma password comprida';
const NOW = Date.parse('2026-10-29T12:00:00Z') / 1000;

let app: ReturnType<typeof createApp>;
let sql: Sql;
const households: { email: string; meter: string }[] = [];

beforeEach(async () => {
  sql = memorySql().sql;
  app = createApp({ sql, sessionSecret: 's'.repeat(32), allowedOrigins: [], now: () => NOW });
  households.length = 0;
  for (const email of ['ana@example.pt', 'rui@example.pt']) {
    const id = (await createHousehold(sql, email, 0)).id;
    await createUser(
      sql,
      { householdId: id, email, passwordHash: await hashPassword(PASSWORD, 1000) },
      0,
    );
    const device = await createDevice(
      sql,
      { householdId: id, name: 'Quadro', tokenHash: email.padEnd(64, 'x') },
      0,
    );
    households.push({ email, meter: `${device.id}:0` });
  }
});

async function signIn(index: number) {
  const response = await app.request(`${ORIGIN}/v1/auth/login`, {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: households[index]?.email, password: PASSWORD }),
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

const day = (date: string, data: string, version = 1) => ({
  day: date,
  version,
  minutes: 1440,
  data,
});

async function list(cookie: string, meter: string, from = '2026-10-01', to = '2026-10-31') {
  const response = await request(
    cookie,
    'GET',
    `/v1/nilm/days?meter=${meter}&from=${from}&to=${to}`,
  );
  return { status: response.status, body: (await response.json()) as { days: unknown[] } };
}

describe('/v1/nilm/days', () => {
  it('keeps each day, replaces it when saved again, and returns the bytes as sent', async () => {
    const ana = await signIn(0);
    const { meter } = households[0] as { meter: string };
    const put = (days: unknown[]) => request(ana, 'PUT', '/v1/nilm/days', { meter, days });
    expect((await put([day('2026-10-27', 'AAEC'), day('2026-10-28', 'AwQF')])).status).toBe(204);
    expect((await put([day('2026-10-27', '_-9A', 2)])).status).toBe(204);

    const { body } = await list(ana, meter);
    expect(body.days).toEqual([day('2026-10-27', '_-9A', 2), day('2026-10-28', 'AwQF')]);
    expect((await list(ana, meter, '2026-10-28', '2026-10-28')).body.days).toHaveLength(1);
  });

  it('keeps households apart', async () => {
    const ana = await signIn(0);
    const rui = await signIn(1);
    const { meter } = households[0] as { meter: string };
    await request(ana, 'PUT', '/v1/nilm/days', { meter, days: [day('2026-10-27', 'AAEC')] });
    expect((await list(rui, meter)).body.days).toEqual([]);
    // Another household's meter cannot be written.
    const write = await request(rui, 'PUT', '/v1/nilm/days', {
      meter,
      days: [day('2026-10-27', 'AwQF')],
    });
    expect(write.status).toBe(404);
    expect((await list(ana, meter)).body.days).toEqual([day('2026-10-27', 'AAEC')]);
  });

  it('refuses today, repeated days, bad data and long ranges', async () => {
    const ana = await signIn(0);
    const { meter } = households[0] as { meter: string };
    const put = (days: unknown[]) => request(ana, 'PUT', '/v1/nilm/days', { meter, days });
    expect((await put([day('2026-10-29', 'AAEC')])).status).toBe(400);
    expect((await put([day('2026-10-27', 'AAEC'), day('2026-10-27', 'AwQF')])).status).toBe(400);
    expect((await put([day('2026-10-27', 'not base64!')])).status).toBe(400);
    expect((await put([])).status).toBe(400);
    expect((await list(ana, meter, '2025-01-01', '2026-10-31')).status).toBe(400);
    expect((await list(ana, meter, '2026-10-31', '2026-10-01')).status).toBe(400);
  });
});
