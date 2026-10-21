// SPDX-License-Identifier: AGPL-3.0-or-later
/** Calls to the project's API (server/). Every response is validated with zod. */
import { z } from 'zod';
import { PROJECT_API_URL } from './api-config';

export const API_URL: string = import.meta.env.VITE_API_URL || PROJECT_API_URL;

const Health = z.object({ status: z.enum(['ok', 'degraded']), database: z.boolean() });
export type Health = z.infer<typeof Health>;

export async function fetchHealth(signal?: AbortSignal): Promise<Health> {
  const response = await fetch(`${API_URL}/v1/health`, { signal });
  return Health.parse(await response.json());
}
