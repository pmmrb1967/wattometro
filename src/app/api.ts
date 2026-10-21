// SPDX-License-Identifier: AGPL-3.0-or-later
/** Calls to the project's API, same-origin under /v1. Every response is validated with zod. */
import { z } from 'zod';

const Health = z.object({ status: z.enum(['ok', 'degraded']), database: z.boolean() });
export type Health = z.infer<typeof Health>;

export async function fetchHealth(signal?: AbortSignal): Promise<Health> {
  const response = await fetch('/v1/health', { signal });
  return Health.parse(await response.json());
}
