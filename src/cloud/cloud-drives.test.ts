// SPDX-License-Identifier: AGPL-3.0-or-later
// Adapted from Faturómetro (src/cloud/cloud-drives.test.ts).
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cloudAccountLabel,
  linkedDrive,
  signedInDrive,
  signedInLink,
  forgetSignIn,
} from './cloud-drives';
import { holdFreshTokens } from './cloud-tokens';
import { CloudError, type CloudDrive } from './drive';
import { Dropbox } from './dropbox';
import { GoogleDrive } from './gdrive';

afterEach(() => {
  vi.unstubAllGlobals();
});

const reply = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function stubSession(): void {
  const storage = new Map<string, string>();
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, v),
    removeItem: (k: string) => void storage.delete(k),
  });
  vi.stubGlobal('window', { sessionStorage: globalThis.sessionStorage });
}

describe('linkedDrive', () => {
  it('opens Dropbox with an access token renewed from the link', async () => {
    const seen: { url: string; auth: string | null; body: string }[] = [];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input);
      seen.push({
        url,
        auth: new Headers(init.headers).get('Authorization'),
        body: String(init.body ?? ''),
      });
      if (url.endsWith('/oauth2/token'))
        return reply({ access_token: 'acesso', expires_in: 14400 });
      return reply({ entries: [], cursor: 'c', has_more: false });
    });
    const drive = linkedDrive({
      provider: 'dropbox',
      refreshToken: `ligacao-${crypto.randomUUID()}`,
    });
    expect(drive).toBeInstanceOf(Dropbox);
    expect(await drive.list('copias')).toEqual([]);
    expect(seen[0]?.url).toBe('https://api.dropboxapi.com/oauth2/token');
    expect(seen[0]?.body).toContain('grant_type=refresh_token');
    expect(seen[1]?.auth).toBe('Bearer acesso');
  });

  it('asks to link Google Drive again when the link was refused, through the same origin', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return String(input).endsWith('/v1/google/token')
        ? reply({ error: 'Sign in again' }, 401)
        : reply({ files: [] });
    });
    const drive = linkedDrive({ provider: 'gdrive', refreshToken: `g-${crypto.randomUUID()}` });
    expect(drive).toBeInstanceOf(GoogleDrive);
    const error = await drive.list('copias').catch((e: unknown) => e);
    expect((error as CloudError).code).toBe('needs_reconnect');
    expect(urls).toEqual(['/v1/google/token']);
  });

  it('asks to link again a Dropbox link with no refresh token', async () => {
    const error = await linkedDrive({ provider: 'dropbox' })
      .list('copias')
      .catch((e: unknown) => e);
    expect((error as CloudError).code).toBe('needs_reconnect');
  });
});

describe('signedInDrive', () => {
  it('uses the tokens of the sign-in that just came back, and hands out its lasting link', async () => {
    stubSession();
    const key = holdFreshTokens({
      provider: 'dropbox',
      accessToken: 'acabado-de-chegar',
      refreshToken: 'r',
      expiresAt: Date.now() + 3_600_000,
    });
    const auth: (string | null)[] = [];
    vi.stubGlobal('fetch', async (_input: RequestInfo | URL, init: RequestInit = {}) => {
      auth.push(new Headers(init.headers).get('Authorization'));
      return reply({ entries: [], cursor: 'c', has_more: false });
    });
    await signedInDrive('dropbox', key).list('copias');
    expect(auth).toEqual(['Bearer acabado-de-chegar']);
    expect(signedInLink('dropbox', key)).toBe('r');
    expect(signedInLink('onedrive', key)).toBeUndefined();
    forgetSignIn('dropbox', key);
    expect(signedInLink('dropbox', key)).toBeUndefined();
  });
});

describe('cloudAccountLabel', () => {
  it('gives the label, or undefined when it cannot be read', async () => {
    const ok = { account: async () => ({ label: 'a@b.pt' }) } as unknown as CloudDrive;
    const failing = {
      account: async () => {
        throw new CloudError('offline');
      },
    } as unknown as CloudDrive;
    expect(await cloudAccountLabel(ok)).toBe('a@b.pt');
    expect(await cloudAccountLabel(failing)).toBeUndefined();
  });
});
