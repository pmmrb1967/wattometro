// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The PVGIS hourly PV series (docs/pvgis.md) for GET /v1/solar: PVGIS refuses
 * calls from browsers, so the Worker asks and passes the body on unread (the
 * browser validates it, src/domain/solar.ts). The request carries only the
 * locality's centre and the panels' angle, orientation and losses; always
 * 1 kWp (the browser scales).
 */
import type { HouseholdLocation } from './repo/households';

export const PVGIS_URL = 'https://re.jrc.ec.europa.eu/api/v5_3/seriescalc';
/** The last year of PVGIS-SARAH3 on 2026-10-29 (docs/pvgis.md). */
export const PVGIS_YEAR = 2023;

export interface PanelGeometry {
  angle: number;
  aspect: number;
  loss: number;
}

export type BodyFetcher = (url: string) => Promise<Response>;

export const pvgisFetch: BodyFetcher = (url) =>
  fetch(url, { headers: { 'User-Agent': 'wattometro' }, redirect: 'follow' });

export function pvgisUrl(location: HouseholdLocation, panels: PanelGeometry): string {
  const query = new URLSearchParams({
    lat: (location.latitudeCdeg / 100).toFixed(2),
    lon: (location.longitudeCdeg / 100).toFixed(2),
    peakpower: '1',
    loss: String(panels.loss),
    angle: String(panels.angle),
    aspect: String(panels.aspect),
    pvcalculation: '1',
    startyear: String(PVGIS_YEAR),
    endyear: String(PVGIS_YEAR),
    outputformat: 'json',
  });
  return `${PVGIS_URL}?${query}`;
}
