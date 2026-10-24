// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The position of this phone or computer, asked only when the user presses the
 * button (the browser then asks for permission), and kept only after the user
 * confirms it. Rounded to hundredths of a degree (~1 km) before anything else
 * sees it, like a chosen locality (docs/open-meteo.md).
 */
import { toCdeg } from './geocoding';

export type DevicePosition =
  | { ok: true; latitudeCdeg: number; longitudeCdeg: number; accuracyM: number }
  | { ok: false; reason: 'unsupported' | 'denied' | 'unavailable' };

/** A position about the size of a town is enough; a fresh fix is not needed. */
const OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 20_000,
  maximumAge: 10 * 60 * 1000,
};

export function requestDevicePosition(): Promise<DevicePosition> {
  return new Promise((resolve) => {
    const geolocation = typeof navigator === 'undefined' ? undefined : navigator.geolocation;
    if (!geolocation) {
      resolve({ ok: false, reason: 'unsupported' });
      return;
    }
    try {
      geolocation.getCurrentPosition(
        ({ coords }) =>
          resolve({
            ok: true,
            latitudeCdeg: toCdeg(coords.latitude),
            longitudeCdeg: toCdeg(coords.longitude),
            accuracyM: Math.round(coords.accuracy),
          }),
        (error) =>
          resolve({
            ok: false,
            reason: error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable',
          }),
        OPTIONS,
      );
    } catch {
      resolve({ ok: false, reason: 'unavailable' });
    }
  });
}

/** A map centred on a position, for the user to check it before saving. */
export function mapLink(latitudeCdeg: number, longitudeCdeg: number): string {
  const lat = (latitudeCdeg / 100).toFixed(2);
  const lon = (longitudeCdeg / 100).toFixed(2);
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=13/${lat}/${lon}`;
}
