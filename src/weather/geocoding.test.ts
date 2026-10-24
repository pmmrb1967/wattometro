// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchLocalities } from './geocoding';

/** Trimmed from a real answer for "Coimbra" (2026-10-24). */
const COIMBRA = {
  results: [
    {
      id: 2740637,
      name: 'Coimbra',
      latitude: 40.20686,
      longitude: -8.41996,
      country_code: 'PT',
      admin1: 'Distrito de Coimbra',
      admin2: 'Coimbra',
    },
    {
      id: 2269154,
      name: 'Coimbrã',
      latitude: 39.33711,
      longitude: -9.31524,
      admin1: 'Distrito de Leiria',
      admin2: 'Peniche',
    },
  ],
  generationtime_ms: 0.15,
};

function stubFetch(response: Response | Error) {
  const fetch = vi.fn<(url: string) => Promise<Response>>(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('searchLocalities', () => {
  it('asks for Portuguese localities and rounds to hundredths of a degree', async () => {
    const fetch = stubFetch(Response.json(COIMBRA));
    expect(await searchLocalities(' Coimbra ')).toEqual([
      {
        id: 2740637,
        name: 'Coimbra',
        region: 'Distrito de Coimbra',
        latitudeCdeg: 4021,
        longitudeCdeg: -842,
      },
      {
        id: 2269154,
        name: 'Coimbrã',
        region: 'Peniche, Distrito de Leiria',
        latitudeCdeg: 3934,
        longitudeCdeg: -932,
      },
    ]);
    const url = new URL(fetch.mock.calls[0]?.[0] ?? '');
    expect(url.origin).toBe('https://geocoding-api.open-meteo.com');
    expect(url.searchParams.get('name')).toBe('Coimbra');
    expect(url.searchParams.get('countryCode')).toBe('PT');
  });

  it('no results: an empty list (the service omits "results")', async () => {
    stubFetch(Response.json({ generationtime_ms: 0.1 }));
    expect(await searchLocalities('zzzqqq')).toEqual([]);
  });

  it('too short: nothing is sent', async () => {
    const fetch = stubFetch(Response.json(COIMBRA));
    expect(await searchLocalities('Co')).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('errors and unexpected answers: null', async () => {
    stubFetch(Response.json({ error: true, reason: 'x' }, { status: 400 }));
    expect(await searchLocalities('Coimbra')).toBeNull();
    stubFetch(Response.json({ results: [{ id: 1, name: 'X', latitude: 'a' }] }));
    expect(await searchLocalities('Coimbra')).toBeNull();
    stubFetch(new Error('offline'));
    expect(await searchLocalities('Coimbra')).toBeNull();
  });
});
