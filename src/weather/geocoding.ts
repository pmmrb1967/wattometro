// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Finds Portuguese localities by name with the Open-Meteo Geocoding API
 * (docs/open-meteo.md), so the user picks a locality instead of sharing an
 * address or GPS. Only the typed name leaves the browser.
 */
import { z } from 'zod';
import { isDemo } from '../demo/mode';

const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const MAX_RESULTS = 8;
/** Shorter names only match exactly (docs/open-meteo.md). */
export const MIN_QUERY_LENGTH = 3;

const GeocodingResponse = z.object({
  results: z
    .array(
      z.object({
        id: z.number(),
        name: z.string(),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        admin1: z.string().optional(),
        admin2: z.string().optional(),
      }),
    )
    .optional(),
});

export interface Locality {
  id: number;
  name: string;
  /** District or municipality, to tell homonyms apart. */
  region: string;
  /** Hundredths of a degree (~1 km). */
  latitudeCdeg: number;
  longitudeCdeg: number;
}

/** Degrees → hundredths of a degree, as stored for the household. */
export const toCdeg = (degrees: number) => Math.round(degrees * 100);

/** A few fictional answers in the demonstration: nothing is sent. */
const DEMO_LOCALITIES: Locality[] = [
  { id: 1, name: 'Lisboa', region: 'Lisboa', latitudeCdeg: 3872, longitudeCdeg: -914 },
  { id: 2, name: 'Porto', region: 'Porto', latitudeCdeg: 4115, longitudeCdeg: -861 },
  { id: 3, name: 'Coimbra', region: 'Coimbra', latitudeCdeg: 4021, longitudeCdeg: -842 },
  { id: 4, name: 'Faro', region: 'Faro', latitudeCdeg: 3702, longitudeCdeg: -793 },
];

const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Localities in Portugal whose name starts with `query`; null when the service failed. */
export async function searchLocalities(
  query: string,
  signal?: AbortSignal,
): Promise<Locality[] | null> {
  const name = query.trim();
  if (name.length < MIN_QUERY_LENGTH) return [];
  if (isDemo()) return DEMO_LOCALITIES.filter((l) => fold(l.name).startsWith(fold(name)));
  const params = new URLSearchParams({
    name,
    count: String(MAX_RESULTS),
    language: 'pt',
    countryCode: 'PT',
    format: 'json',
  });
  try {
    const response = await fetch(`${GEOCODING_URL}?${params}`, { signal });
    if (!response.ok) return null;
    const parsed = GeocodingResponse.safeParse(await response.json());
    if (!parsed.success) return null;
    return (parsed.data.results ?? []).map((result) => ({
      id: result.id,
      name: result.name,
      region: [result.admin2, result.admin1]
        .filter((part): part is string => part !== undefined && part !== result.name)
        .join(', '),
      latitudeCdeg: toCdeg(result.latitude),
      longitudeCdeg: toCdeg(result.longitude),
    }));
  } catch {
    return null;
  }
}
