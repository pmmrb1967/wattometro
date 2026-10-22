// SPDX-License-Identifier: AGPL-3.0-or-later
/** Worker environment (server/wrangler.toml). Limits are variables there. */
import type { D1Like } from './db';

export interface Env {
  DB: D1Like;
  /** Secret (wrangler secret put SESSION_SECRET): at least 32 random characters. */
  SESSION_SECRET: string;
  /** Comma-separated extra origins allowed to send writes (local development). */
  ALLOWED_ORIGINS: string;
  /** Ingest requests a device may send per minute; ingest.ts has the default. */
  INGEST_REQUESTS_PER_MINUTE?: string;
}

export function allowedOrigins(env: Env): string[] {
  return env.ALLOWED_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin !== '');
}

/** A positive integer variable, or undefined (then the code's default applies). */
export function positiveInteger(value: string | undefined): number | undefined {
  const number = Number(value);
  return value !== undefined && Number.isInteger(number) && number > 0 ? number : undefined;
}
