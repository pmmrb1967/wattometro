// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Calls to the project's API, same-origin under /v1; every response is
 * validated with zod. The household's contracts, the ERSE offers and the market prices.
 */
import { z } from 'zod';
import { OFFERS_URL, offersFileSchema, type OffersFile } from '../domain/erse';
import { OMIE_URL, omieFileSchema, type OmieFile } from '../domain/omie';
import { tariffInputSchema, type Tariff, type TariffInput } from '../domain/tariff';
import { type Failure, failure, send } from './client';

const TariffResponse = tariffInputSchema.and(z.object({ id: z.string() }));

/** The household's contracts, oldest first. */
export async function fetchTariffs(): Promise<{ ok: true; tariffs: Tariff[] } | Failure> {
  const response = await send('GET', '/v1/tariffs');
  if (response?.ok) {
    const { tariffs } = z.object({ tariffs: z.array(TariffResponse) }).parse(await response.json());
    return { ok: true, tariffs };
  }
  return failure(response, []);
}

/** A contract starting on the same day as an existing one replaces it. */
export async function saveTariff(
  input: TariffInput,
): Promise<{ ok: true; tariff: Tariff } | Failure> {
  const response = await send('POST', '/v1/tariffs', input);
  if (response?.ok) {
    return {
      ok: true,
      tariff: z.object({ tariff: TariffResponse }).parse(await response.json()).tariff,
    };
  }
  return failure(response, [400]);
}

export async function deleteTariff(id: string): Promise<{ ok: true } | Failure> {
  const response = await send('DELETE', `/v1/tariffs/${encodeURIComponent(id)}`);
  if (response?.ok) return { ok: true };
  return failure(response, []);
}

/** The ERSE offers (public/data, 1,7 MB): fetched only when needed. */
export async function fetchOffers(): Promise<OffersFile | null> {
  try {
    const response = await fetch(OFFERS_URL);
    return response.ok ? offersFileSchema.parse(await response.json()) : null;
  } catch {
    return null;
  }
}

/** The OMIE prices served with the app (public/data/omie-pt.json); null when they cannot be read. */
export async function fetchOmie(): Promise<OmieFile | null> {
  try {
    const response = await fetch(OMIE_URL);
    return response.ok ? omieFileSchema.parse(await response.json()) : null;
  } catch {
    return null;
  }
}

const OmieDays = z.object({
  days: z.array(
    z.object({
      date: z.string(),
      start: z.number().int(),
      step: z.number().int(),
      prices: z.array(z.number().int()),
    }),
  ),
});

export type OmieDays = z.infer<typeof OmieDays>['days'];

/** Today's and tomorrow's market prices the Worker read (GET /v1/omie); null when unavailable. */
export async function fetchOmieDays(): Promise<OmieDays | null> {
  const response = await send('GET', '/v1/omie');
  return response?.ok ? OmieDays.parse(await response.json()).days : null;
}
