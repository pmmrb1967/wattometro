// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mapLink, requestDevicePosition } from './device-location';

const PERMISSION_DENIED = 1;
const POSITION_UNAVAILABLE = 2;

function stubGeolocation(
  answer: { coords: { latitude: number; longitude: number; accuracy: number } } | { code: number },
) {
  const getCurrentPosition = vi.fn(
    (success: PositionCallback, failure: PositionErrorCallback, options: PositionOptions) => {
      void options;
      if ('coords' in answer) success(answer as GeolocationPosition);
      else
        failure({ ...answer, PERMISSION_DENIED, POSITION_UNAVAILABLE } as GeolocationPositionError);
    },
  );
  vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
  return getCurrentPosition;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('requestDevicePosition', () => {
  it('rounds to hundredths of a degree at once (~1 km)', async () => {
    const ask = stubGeolocation({
      coords: { latitude: 41.24521, longitude: -8.722105, accuracy: 35.6 },
    });
    expect(await requestDevicePosition()).toEqual({
      ok: true,
      latitudeCdeg: 4125,
      longitudeCdeg: -872,
      accuracyM: 36,
    });
    expect(ask.mock.calls[0]?.[2]).toMatchObject({ enableHighAccuracy: false });
  });

  it('tells a refusal from other failures', async () => {
    stubGeolocation({ code: PERMISSION_DENIED });
    expect(await requestDevicePosition()).toEqual({ ok: false, reason: 'denied' });
    stubGeolocation({ code: POSITION_UNAVAILABLE });
    expect(await requestDevicePosition()).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('browsers without geolocation', async () => {
    vi.stubGlobal('navigator', {});
    expect(await requestDevicePosition()).toEqual({ ok: false, reason: 'unsupported' });
  });
});

describe('mapLink', () => {
  it('centres OpenStreetMap on the rounded position', () => {
    expect(mapLink(4125, -872)).toBe(
      'https://www.openstreetmap.org/?mlat=41.25&mlon=-8.72#map=13/41.25/-8.72',
    );
  });
});
