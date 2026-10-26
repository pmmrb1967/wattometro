// SPDX-License-Identifier: AGPL-3.0-or-later
import type { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { memorySql } from '../test/sqlite';
import { createApp } from './app';
import type { Sql } from './db';
import { hashPassword } from './password';
import { createHousehold } from './repo/households';
import { createUser } from './repo/users';
import { open, seal } from './secret-box';

const ORIGIN = 'https://app.example';
const PASSWORD = 'uma password comprida';
const SECRET = 'k'.repeat(32);
const NOW = 1_792_000_000;
// Synthetic, in the shape of an Anthropic key.
const KEY = 'sk-ant-api03-exemplo-sintetico';

let db: DatabaseSync;
let sql: Sql;

beforeEach(async () => {
  const memory = memorySql();
  db = memory.db;
  sql = memory.sql;
  const householdId = (await createHousehold(sql, 'Casa', NOW)).id;
  for (const email of ['ana@example.pt', 'rui@example.pt']) {
    await createUser(
      sql,
      { householdId, email, passwordHash: await hashPassword(PASSWORD, 1000) },
      NOW,
    );
  }
});

const makeApp = (aiKeySecret?: string) =>
  createApp({
    sql,
    sessionSecret: 's'.repeat(32),
    ...(aiKeySecret ? { aiKeySecret } : {}),
    allowedOrigins: [],
    now: () => NOW,
  });

async function signIn(app: ReturnType<typeof makeApp>, email = 'ana@example.pt') {
  const response = await app.request(`${ORIGIN}/v1/auth/login`, {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const value = /__Host-wm_session=([^;]+)/.exec(response.headers.get('Set-Cookie') ?? '')?.[1];
  if (!value) throw new Error('no session cookie');
  const cookie = `__Host-wm_session=${value}`;
  return (method: string, body?: unknown) =>
    app.request(`${ORIGIN}/v1/ai-settings`, {
      method,
      headers: { Origin: ORIGIN, Cookie: cookie, 'Content-Type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
}

describe('secret-box', () => {
  it('opens only with the same secret and for the same owner', async () => {
    const sealed = await seal(SECRET, KEY, 'user-1');
    expect(sealed).toMatch(/^v1\.[\w-]+\.[\w-]+$/);
    expect(sealed).not.toContain(KEY);
    expect(await open(SECRET, sealed, 'user-1')).toBe(KEY);
    expect(await open('x'.repeat(32), sealed, 'user-1')).toBeNull();
    expect(await open(SECRET, sealed, 'user-2')).toBeNull();
    expect(await open(SECRET, 'v2.a.b', 'user-1')).toBeNull();
    // A fresh IV every time.
    expect(await seal(SECRET, KEY, 'user-1')).not.toBe(sealed);
  });
});

describe('/v1/ai-settings', () => {
  it('saves the key sealed and gives it back on another device of the same user', async () => {
    const app = makeApp(SECRET);
    const pc = await signIn(app);
    expect((await pc('GET')).status).toBe(404);
    const saved = await pc('PUT', {
      apiKey: ` ${KEY} `,
      model: 'claude-haiku-5-5',
      autoSend: true,
    });
    expect(saved.status).toBe(204);

    const row = db.prepare('SELECT * FROM user_ai_settings').get() as Record<string, unknown>;
    expect(JSON.stringify(row)).not.toContain(KEY);

    const phone = await signIn(app);
    const response = await phone('GET');
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({
      apiKey: KEY,
      model: 'claude-haiku-5-5',
      autoSend: true,
      updatedAt: NOW,
    });
  });

  it('keeps each user’s key to that user', async () => {
    const app = makeApp(SECRET);
    await (
      await signIn(app)
    )('PUT', { apiKey: KEY, model: 'm', autoSend: false });
    expect((await (await signIn(app, 'rui@example.pt'))('GET')).status).toBe(404);
  });

  it('forgets the key on every device', async () => {
    const app = makeApp(SECRET);
    const pc = await signIn(app);
    await pc('PUT', { apiKey: KEY, model: 'm', autoSend: false });
    expect((await pc('DELETE')).status).toBe(204);
    expect((await (await signIn(app))('GET')).status).toBe(404);
    expect(db.prepare('SELECT COUNT(*) AS n FROM user_ai_settings').get()).toEqual({ n: 0 });
  });

  it('refuses an empty key, a missing session or another origin', async () => {
    const app = makeApp(SECRET);
    const pc = await signIn(app);
    expect((await pc('PUT', { apiKey: '  ', model: 'm', autoSend: false })).status).toBe(400);
    expect((await app.request(`${ORIGIN}/v1/ai-settings`)).status).toBe(401);
    const foreign = await app.request(`${ORIGIN}/v1/ai-settings`, {
      method: 'DELETE',
      headers: { Origin: 'https://other.example' },
    });
    expect(foreign.status).toBe(403);
  });

  it('answers 503 without AI_KEY_SECRET, so the app keeps the key in the browser', async () => {
    const pc = await signIn(makeApp());
    expect((await pc('GET')).status).toBe(503);
    expect((await pc('PUT', { apiKey: KEY, model: 'm', autoSend: false })).status).toBe(503);
  });

  it('a key sealed with another secret is as good as none', async () => {
    const pc = await signIn(makeApp(SECRET));
    await pc('PUT', { apiKey: KEY, model: 'm', autoSend: false });
    expect((await (await signIn(makeApp('z'.repeat(32))))('GET')).status).toBe(404);
  });
});
