// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import gateway, { isApiPath, type Fetcher } from './gateway';

const named = (name: string): Fetcher => ({
  fetch: async (request) => new Response(`${name} ${new URL(request.url).pathname}`),
});

const env = { API: named('api'), ASSETS: named('assets') };

describe('gateway', () => {
  it.each([
    ['/v1/health', 'api /v1/health'],
    ['/v1/ingest', 'api /v1/ingest'],
    ['/', 'assets /'],
    ['/agora', 'assets /agora'],
    ['/v1x', 'assets /v1x'],
  ])('sends %s to the right Worker', async (path, expected) => {
    const response = await gateway.fetch(new Request(`https://app.example${path}`), env);
    expect(await response.text()).toBe(expected);
  });

  it('recognises API paths', () => {
    expect(isApiPath('/v1')).toBe(true);
    expect(isApiPath('/v10/x')).toBe(false);
  });
});
