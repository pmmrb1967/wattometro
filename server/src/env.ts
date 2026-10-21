// SPDX-License-Identifier: AGPL-3.0-or-later
/** Worker environment (server/wrangler.toml). Limits will join here as variables. */
import type { D1Like } from './db';

export interface Env {
  DB: D1Like;
  /** Secret (wrangler secret put SESSION_SECRET): at least 32 random characters. */
  SESSION_SECRET: string;
  /** Comma-separated extra origins allowed to send writes (local development). */
  ALLOWED_ORIGINS: string;
}

export function allowedOrigins(env: Env): string[] {
  return env.ALLOWED_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin !== '');
}
