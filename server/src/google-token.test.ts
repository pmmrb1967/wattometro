// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { memorySql } from '../test/sqlite';
import { createApp } from './app';

const ORIGIN = 'https://app.example';
const REDIRECT = `${ORIGIN}/nuvem-retorno`;
const VERIFIER = 'v'.repeat(43);

interface Sent {
  url: string;
  form: Record<string, string>;
}

function setUp(reply: () => Response, configured = true) {
  const sql = memorySql().sql;
  const sent: Sent[] = [];
  const api = createApp({
    sql,
    sessionSecret: 's'.repeat(32),
    allowedOrigins: [],
    ...(configured ? { google: { clientId: 'id-google', clientSecret: 'segredo' } } : {}),
    googleFetch: async (input, init) => {
      sent.push({
        url: String(input),
        form: Object.fromEntries(new URLSearchParams(String(init?.body))),
      });
      return reply();
    },
  });
  const call = async (body: unknown, origin: string | null = ORIGIN) => {
    const response = await api.request(`${ORIGIN}/v1/google/token`, {
      method: 'POST',
      headers: {
        ...(origin ? { Origin: origin } : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };
  return { call, sent };
}

const google =
  (value: unknown, status = 200) =>
  () =>
    new Response(JSON.stringify(value), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

const codeGrant = (redirectUri = REDIRECT) => ({
  grant: 'code',
  code: 'c',
  codeVerifier: VERIFIER,
  redirectUri,
});

describe('POST /v1/google/token', () => {
  it('exchanges the code with the app secret and returns the tokens', async () => {
    const { call, sent } = setUp(
      google({ access_token: 'a1', expires_in: 3599, refresh_token: 'r1', token_type: 'Bearer' }),
    );
    expect(await call(codeGrant())).toEqual({
      status: 200,
      body: { accessToken: 'a1', expiresIn: 3599, refreshToken: 'r1' },
    });
    expect(sent[0]?.url).toBe('https://oauth2.googleapis.com/token');
    expect(sent[0]?.form).toEqual({
      grant_type: 'authorization_code',
      code: 'c',
      code_verifier: VERIFIER,
      redirect_uri: REDIRECT,
      client_id: 'id-google',
      client_secret: 'segredo',
    });
  });

  it('accepts the development return address too', async () => {
    const { call } = setUp(google({ access_token: 'a1', expires_in: 3599 }));
    const reply = await call(codeGrant('http://localhost:5173/nuvem-retorno'));
    expect(reply.status).toBe(200);
  });

  it('renews an access token', async () => {
    const { call, sent } = setUp(google({ access_token: 'a2', expires_in: 3599 }));
    const reply = await call({ grant: 'refresh', refreshToken: 'r1' });
    expect(reply.body).toEqual({ accessToken: 'a2', expiresIn: 3599 });
    expect(sent[0]?.form).toEqual({
      grant_type: 'refresh_token',
      refresh_token: 'r1',
      client_id: 'id-google',
      client_secret: 'segredo',
    });
  });

  it('says when the code or the link is no longer valid', async () => {
    const { call } = setUp(google({ error: 'invalid_grant' }, 400));
    expect((await call({ grant: 'refresh', refreshToken: 'r1' })).status).toBe(401);
  });

  it('answers 502 when Google fails', async () => {
    const { call } = setUp(google({}, 500));
    expect((await call({ grant: 'refresh', refreshToken: 'r1' })).status).toBe(502);
  });

  it('refuses a return address of another site, without asking Google', async () => {
    const { call, sent } = setUp(google({}));
    const reply = await call(codeGrant('https://outro.example/nuvem-retorno'));
    expect(reply.status).toBe(400);
    expect(sent).toEqual([]);
  });

  it('refuses an invalid body, without asking Google', async () => {
    const { call, sent } = setUp(google({}));
    expect((await call({ grant: 'other' })).status).toBe(400);
    expect(sent).toEqual([]);
  });

  it('refuses a request without the app as Origin, without asking Google', async () => {
    const { call, sent } = setUp(google({}));
    expect((await call({ grant: 'refresh', refreshToken: 'r1' }, null)).status).toBe(403);
    expect((await call({ grant: 'refresh', refreshToken: 'r1' }, 'https://x.example')).status).toBe(
      403,
    );
    expect(sent).toEqual([]);
  });

  it('does not exist without the Google app configured', async () => {
    const { call, sent } = setUp(google({}), false);
    expect((await call({ grant: 'refresh', refreshToken: 'r1' })).status).toBe(404);
    expect(sent).toEqual([]);
  });
});
