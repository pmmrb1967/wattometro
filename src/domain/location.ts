// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The household's locality, for the weather (docs/open-meteo.md) and the
 * solar estimate (docs/pvgis.md): a name and its coordinates in hundredths of
 * a degree (integers). One rule for the Worker, the local mode and the
 * demonstration (server/src/contract.test.ts).
 */
import { z } from 'zod';

export const MAX_LOCATION_NAME = 120;

export const householdLocationSchema = z.object({
  name: z.string().trim().min(1).max(MAX_LOCATION_NAME),
  latitudeCdeg: z.number().int().min(-9000).max(9000),
  longitudeCdeg: z.number().int().min(-18000).max(18000),
});
export type HouseholdLocation = z.infer<typeof householdLocationSchema>;

/** PUT /v1/household/location: a locality, or null to forget it. */
export const locationBodySchema = z.object({ location: householdLocationSchema.nullable() });
