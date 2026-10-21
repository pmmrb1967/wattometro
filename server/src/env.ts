// SPDX-License-Identifier: AGPL-3.0-or-later
/** Worker environment (server/wrangler.toml). Limits will join here as variables. */
import type { D1Like } from './db';

export interface Env {
  DB: D1Like;
  /** Comma-separated app origins allowed to call the API. */
  ALLOWED_ORIGINS: string;
}

export function allowedOrigins(env: Env): string[] {
  return env.ALLOWED_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin !== '');
}
