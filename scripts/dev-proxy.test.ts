// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { apiProxy } from '../dev-proxy';

/** A request on its way through the proxy, with the headers the browser gave it. */
function outgoing(headers: Record<string, string>) {
  const sent = new Map(Object.entries(headers));
  return {
    sent,
    getHeader: (name: string) => sent.get(name),
    setHeader: (name: string, value: string) => void sent.set(name, value),
  };
}

function throughProxy(target: string, headers: Record<string, string>) {
  const request = outgoing(headers);
  apiProxy(target).configure({
    on: (_event, listener) => listener(request),
  });
  return request.sent;
}

describe('apiProxy', () => {
  it('sends a write with the origin of the API it goes to, as the published app would', () => {
    // `pnpm dev` on localhost:5173 against the published API: the API sees its own origin.
    const sent = throughProxy('https://app.wattometro.workers.dev', {
      origin: 'http://localhost:5173',
    });
    expect(sent.get('origin')).toBe('https://app.wattometro.workers.dev');
    expect(throughProxy('http://localhost:8787/', { origin: 'http://localhost:5173' })).toEqual(
      new Map([['origin', 'http://localhost:8787']]),
    );
  });

  it('adds no origin to a request that had none (a GET)', () => {
    expect(throughProxy('http://localhost:8787', {}).has('origin')).toBe(false);
  });
});

describe('the published API', () => {
  it('takes writes only from its own origin: no development origins in production', () => {
    const toml = readFileSync('server/wrangler.toml', 'utf8');
    expect(/^ALLOWED_ORIGINS = "(.*)"$/m.exec(toml)?.[1]).toBe('');
  });
});
