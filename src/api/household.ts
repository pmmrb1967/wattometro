// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Calls to the project's API, same-origin under /v1; every response is
 * validated with zod. The household: its name, locality, budget, installation, and its solar estimate.
 */
import { z } from 'zod';
import { isDemo } from '../demo/mode';
import { parsePvgis, type SolarYear } from '../domain/solar';
import { budgetSchema, type Budget } from '../domain/budget';
import { installationSchema, type Installation } from '../domain/installation';
import { Me } from './account';
import { type Failure, failure, int, send } from './client';

export async function renameHousehold(name: string): Promise<{ ok: true; me: Me } | Failure> {
  const response = await send('PUT', '/v1/household', { name });
  if (response?.ok) return { ok: true, me: Me.parse(await response.json()) };
  return failure(response, [400]);
}

const HouseholdLocation = z.object({
  name: z.string(),
  /** Hundredths of a degree (docs/open-meteo.md). */
  latitudeCdeg: int,
  longitudeCdeg: int,
});

export type HouseholdLocation = z.infer<typeof HouseholdLocation>;

/** The locality of the house, for the weather; null until one is chosen. */
export async function fetchHouseholdLocation(): Promise<
  { ok: true; location: HouseholdLocation | null } | Failure
> {
  const response = await send('GET', '/v1/household/location');
  if (response?.ok) {
    const parsed = z
      .object({ location: HouseholdLocation.nullable() })
      .parse(await response.json());
    return { ok: true, location: parsed.location };
  }
  return failure(response, []);
}

export async function saveHouseholdLocation(
  location: HouseholdLocation | null,
): Promise<{ ok: true } | Failure> {
  const response = await send('PUT', '/v1/household/location', { location });
  if (response?.ok) return { ok: true };
  return failure(response, [400]);
}

/** The month's budget (Consumo › Previsão); null without one. */
export async function fetchBudget(): Promise<{ ok: true; budget: Budget | null } | Failure> {
  const response = await send('GET', '/v1/household/budget');
  if (response?.ok) {
    const parsed = z.object({ budget: budgetSchema.nullable() }).parse(await response.json());
    return { ok: true, budget: parsed.budget };
  }
  return failure(response, []);
}

export async function saveBudget(budget: Budget | null): Promise<{ ok: true } | Failure> {
  const response = await send('PUT', '/v1/household/budget', { budget });
  if (response?.ok) return { ok: true };
  return failure(response, [400]);
}

/** What the household said about its installation; every answer null until saved. */
export async function fetchHouseholdInstallation(): Promise<
  { ok: true; installation: Installation } | Failure
> {
  const response = await send('GET', '/v1/household/installation');
  if (response?.ok) {
    const parsed = z.object({ installation: installationSchema }).parse(await response.json());
    return { ok: true, installation: parsed.installation };
  }
  return failure(response, []);
}

export async function saveHouseholdInstallation(
  installation: Installation,
): Promise<{ ok: true } | Failure> {
  const response = await send('PUT', '/v1/household/installation', { installation });
  if (response?.ok) return { ok: true };
  return failure(response, [400]);
}

/**
 * PVGIS's production for 1 kWp at the household's locality (GET /v1/solar,
 * docs/pvgis.md); 'noLocation' until a locality is chosen. The demonstration
 * reads a kept answer for Lisbon (35°, south), whatever the panels.
 */
export async function fetchSolarYear(panels: {
  angle: number;
  aspect: number;
  loss: number;
}): Promise<{ ok: true; year: SolarYear } | { ok: false; reason: 'noLocation' } | Failure> {
  const query = new URLSearchParams({
    angle: String(panels.angle),
    aspect: String(panels.aspect),
    loss: String(panels.loss),
  });
  let response: Response | null;
  try {
    response = await (isDemo() ? fetch('/data/pvgis-demo.json') : fetch(`/v1/solar?${query}`));
  } catch {
    response = null;
  }
  if (response?.ok) {
    const year = parsePvgis(await response.json().catch(() => null));
    return year ? { ok: true, year } : { ok: false, reason: 'unavailable' };
  }
  if (response?.status === 409) return { ok: false, reason: 'noLocation' };
  return failure(response, [400]);
}
