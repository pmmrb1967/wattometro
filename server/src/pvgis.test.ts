// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'vitest';
import { memorySql } from '../test/sqlite';
import { createApp } from './app';
import type { Sql } from './db';
import { hashPassword } from './password';
import { createHousehold, setHouseholdLocation } from './repo/households';
import { createUser } from './repo/users';

const ORIGIN = 'https://app.example';
const EMAIL = 'ana@example.pt';
const PASSWORD = 'uma password comprida';

let sql: Sql;
let householdId: string;
let asked: string[];
let answer: () => Promise<Response>;

function app() {
  return createApp({
    sql,
    sessionSecret: 's'.repeat(32),
    allowedOrigins: [],
    now: () => Date.parse('2026-10-29T12:00:00Z') / 1000,
    pvgisFetcher: (url) => {
      asked.push(url);
      return answer();
    },
  });
}

beforeEach(async () => {
  sql = memorySql().sql;
  asked = [];
  answer = async () => new Response('{"outputs":{"hourly":[]}}', { status: 200 });
  householdId = (await createHousehold(sql, 'Casa', 0)).id;
  await createUser(
    sql,
    { householdId, email: EMAIL, passwordHash: await hashPassword(PASSWORD, 1000) },
    0,
  );
});

async function solar(query: string) {
  const api = app();
  const login = await api.request(`${ORIGIN}/v1/auth/login`, {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const cookie = /__Host-wm_session=[^;]+/.exec(login.headers.get('Set-Cookie') ?? '')?.[0] ?? '';
  return api.request(`${ORIGIN}/v1/solar?${query}`, { headers: { Cookie: cookie } });
}

describe('GET /v1/solar', () => {
  it('asks PVGIS for 1 kWp at the locality, with nothing else of the house', async () => {
    await setHouseholdLocation(sql, householdId, {
      name: 'Lisboa',
      latitudeCdeg: 3872,
      longitudeCdeg: -914,
    });
    const response = await solar('angle=35&aspect=-45&loss=14');
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('{"outputs":{"hourly":[]}}');
    expect(asked).toEqual([
      'https://re.jrc.ec.europa.eu/api/v5_3/seriescalc?lat=38.72&lon=-9.14&peakpower=1&loss=14' +
        '&angle=35&aspect=-45&pvcalculation=1&startyear=2023&endyear=2023&outputformat=json',
    ]);
  });

  it('needs a locality, valid panels and PVGIS answering', async () => {
    expect((await solar('angle=35&aspect=0&loss=14')).status).toBe(409);
    await setHouseholdLocation(sql, householdId, {
      name: 'Porto',
      latitudeCdeg: 4115,
      longitudeCdeg: -861,
    });
    expect((await solar('angle=95&aspect=0&loss=14')).status).toBe(400);
    expect((await solar('angle=35&aspect=0')).status).toBe(400);
    answer = async () => new Response('busy', { status: 529 });
    expect((await solar('angle=35&aspect=0&loss=14')).status).toBe(502);
    answer = () => Promise.reject(new Error('offline'));
    expect((await solar('angle=35&aspect=0&loss=14')).status).toBe(502);
    expect(asked).toHaveLength(2);
  });
});
