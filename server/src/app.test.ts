// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'vitest';
import { memorySql } from '../test/sqlite';
import { createApp } from './app';
import type { Sql } from './db';
import { allowedOrigins } from './env';

const ORIGIN = 'https://app.example';

let app: ReturnType<typeof createApp>;

beforeEach(() => {
  app = createApp({ sql: memorySql().sql, allowedOrigins: [ORIGIN] });
});

describe('GET /v1/health', () => {
  it('answers ok when the database is reachable', async () => {
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
    const response = await createApp({ sql: broken, allowedOrigins: [] }).request('/v1/health');
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'degraded', database: false });
  });
});

describe('CORS', () => {
  it('allows the app origin only', async () => {
    const allowed = await app.request('/v1/health', { headers: { Origin: ORIGIN } });
    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);

    const other = await app.request('/v1/health', { headers: { Origin: 'https://evil.example' } });
    expect(other.headers.get('Access-Control-Allow-Origin')).toBeNull();
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
        ALLOWED_ORIGINS: ' https://a , https://b,',
      }),
    ).toEqual(['https://a', 'https://b']);
  });
});
