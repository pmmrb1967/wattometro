// SPDX-License-Identifier: AGPL-3.0-or-later
import type { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { memorySql } from '../test/sqlite';
import { createApp } from './app';
import { LOCK_SECONDS, MAX_LOGIN_FAILURES, SESSION_SECONDS } from './auth';
import type { Sql } from './db';
import { allowedOrigins } from './env';
import { hashPassword } from './password';
import { createHousehold } from './repo/households';
import { createUser } from './repo/users';

const ORIGIN = 'https://app.example';
const DEV_ORIGIN = 'http://localhost:5173';
const SECRET = 's'.repeat(32);
const EMAIL = 'ana@example.pt';
const PASSWORD = 'uma password comprida';
const COOKIE = '__Host-wm_session';

let app: ReturnType<typeof createApp>;
let db: DatabaseSync;
let clock: number;
let householdId: string;

beforeEach(async () => {
  const memory = memorySql();
  db = memory.db;
  clock = 1_792_000_000;
  app = createApp({
    sql: memory.sql,
    sessionSecret: SECRET,
    allowedOrigins: [DEV_ORIGIN],
    now: () => clock,
  });
  householdId = (await createHousehold(memory.sql, 'Casa', clock)).id;
  // Few iterations: the stored count is honoured, and tests stay fast.
  await createUser(
    memory.sql,
    { householdId, email: EMAIL, passwordHash: await hashPassword(PASSWORD, 1000) },
    clock,
  );
});

function post(path: string, body?: unknown, headers: Record<string, string> = {}) {
  return app.request(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json', ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const loginAs = (password = PASSWORD, email = EMAIL, headers?: Record<string, string>) =>
  post('/v1/auth/login', { email, password }, headers);

/** The session cookie as a request header, from a login response. */
function sessionFrom(response: Response): string {
  const value = /__Host-wm_session=([^;]+)/.exec(response.headers.get('Set-Cookie') ?? '')?.[1];
  if (!value) throw new Error('no session cookie');
  return `${COOKIE}=${value}`;
}

const me = (cookie?: string) =>
  app.request(`${ORIGIN}/v1/auth/me`, cookie ? { headers: { Cookie: cookie } } : {});

describe('GET /v1/health', () => {
  it('answers ok when the database is reachable, never cached', async () => {
    const response = await app.request('/v1/health');
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({ status: 'ok', database: true });
  });

  it('answers 503 when the database is down', async () => {
    const broken: Sql = {
      first: () => Promise.reject(new Error('down')),
      all: () => Promise.reject(new Error('down')),
      run: () => Promise.reject(new Error('down')),
    };
    const response = await createApp({
      sql: broken,
      sessionSecret: SECRET,
      allowedOrigins: [],
    }).request('/v1/health');
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'degraded', database: false });
  });
});

describe('login', () => {
  it('sets a strict, HttpOnly, host-only session cookie', async () => {
    const response = await loginAs();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ email: EMAIL, householdId });
    const cookie = response.headers.get('Set-Cookie') ?? '';
    expect(cookie).toContain(`${COOKIE}=`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain(`Max-Age=${SESSION_SECONDS}`);
  });

  it('accepts the email in any case and with spaces', async () => {
    expect((await loginAs(PASSWORD, '  ANA@Example.PT ')).status).toBe(200);
  });

  it('answers the same for a wrong password and an unknown email', async () => {
    const wrong = await loginAs('errada');
    const unknown = await loginAs(PASSWORD, 'ninguem@example.pt');
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await wrong.json()).toEqual(await unknown.json());
    expect(wrong.headers.get('Set-Cookie')).toBeNull();
  });

  it(`locks the email after ${MAX_LOGIN_FAILURES} failures, until the lock expires`, async () => {
    for (let i = 0; i < MAX_LOGIN_FAILURES; i++) expect((await loginAs('errada')).status).toBe(401);

    const locked = await loginAs();
    expect(locked.status).toBe(429);
    expect(locked.headers.get('Retry-After')).toBe(String(LOCK_SECONDS));

    clock += LOCK_SECONDS;
    expect((await loginAs()).status).toBe(200);
  });

  it('forgets failures after a successful login', async () => {
    for (let i = 0; i < MAX_LOGIN_FAILURES - 1; i++) await loginAs('errada');
    expect((await loginAs()).status).toBe(200);
    expect((await loginAs('errada')).status).toBe(401);
    expect((await loginAs()).status).toBe(200);
  });

  it('refuses requests from other origins or without one', async () => {
    expect((await loginAs(PASSWORD, EMAIL, { Origin: 'https://evil.example' })).status).toBe(403);
    const noOrigin = await app.request(`${ORIGIN}/v1/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    expect(noOrigin.status).toBe(403);
    expect((await loginAs(PASSWORD, EMAIL, { Origin: DEV_ORIGIN })).status).toBe(200);
  });

  it('rejects malformed bodies', async () => {
    expect((await post('/v1/auth/login', { email: EMAIL })).status).toBe(400);
    expect((await post('/v1/auth/login', undefined)).status).toBe(400);
  });
});

describe('session', () => {
  it('identifies the user', async () => {
    const response = await me(sessionFrom(await loginAs()));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ email: EMAIL, householdId });
  });

  it('is required', async () => {
    const response = await me();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthenticated' });
  });

  it('rejects a tampered token', async () => {
    const cookie = sessionFrom(await loginAs());
    const [data = '', signature = ''] = cookie.slice(COOKIE.length + 1).split('.');
    const forged = `${data.slice(0, -2)}AA.${signature}`;
    expect((await me(`${COOKIE}=${forged}`)).status).toBe(401);
    expect((await me(`${COOKIE}=garbage`)).status).toBe(401);
  });

  it('expires', async () => {
    const cookie = sessionFrom(await loginAs());
    clock += SESSION_SECONDS;
    expect((await me(cookie)).status).toBe(401);
  });

  it('ends everywhere when the session version is raised', async () => {
    const cookie = sessionFrom(await loginAs());
    db.prepare('UPDATE users SET session_version = session_version + 1').run();
    expect((await me(cookie)).status).toBe(401);
  });

  it('ends when the account is deleted', async () => {
    const cookie = sessionFrom(await loginAs());
    db.prepare('DELETE FROM users').run();
    expect((await me(cookie)).status).toBe(401);
  });

  it('is not accepted with another secret', async () => {
    const cookie = sessionFrom(await loginAs());
    const other = createApp({
      sql: memorySql().sql,
      sessionSecret: 'x'.repeat(32),
      allowedOrigins: [],
      now: () => clock,
    });
    expect(
      (await other.request(`${ORIGIN}/v1/auth/me`, { headers: { Cookie: cookie } })).status,
    ).toBe(401);
  });
});

describe('logout', () => {
  it('clears the cookie', async () => {
    const response = await post('/v1/auth/logout');
    expect(response.status).toBe(204);
    expect(response.headers.get('Set-Cookie')).toMatch(/__Host-wm_session=;.*Max-Age=0/);
  });

  it('refuses other origins', async () => {
    expect(
      (await post('/v1/auth/logout', undefined, { Origin: 'https://evil.example' })).status,
    ).toBe(403);
  });
});

describe('unknown routes', () => {
  it('answer a JSON 404', async () => {
    const response = await app.request('/v1/nothing');
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
  });
});

describe('allowedOrigins', () => {
  it('splits and trims the variable', () => {
    expect(
      allowedOrigins({
        DB: {
          prepare: () => {
            throw new Error('unused');
          },
        },
        SESSION_SECRET: SECRET,
        ALLOWED_ORIGINS: ' https://a , https://b,',
      }),
    ).toEqual(['https://a', 'https://b']);
  });
});
