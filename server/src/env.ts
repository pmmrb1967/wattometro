// SPDX-License-Identifier: AGPL-3.0-or-later
/** Worker environment (server/wrangler.toml). Limits are variables there. */
import type { WorkersAi } from './ai-free';
import type { D1Like } from './db';
import type { GoogleApp } from './google-token';
import type { VapidKeys } from './webpush';

export interface Env {
  DB: D1Like;
  /** Workers AI (wrangler.toml, [ai]): the free AI (ai-free.ts). */
  AI?: WorkersAi;
  /** Secret (wrangler secret put SESSION_SECRET): at least 32 random characters. */
  SESSION_SECRET: string;
  /** Secret (wrangler secret put AI_KEY_SECRET): at least 32 random characters; seals the AI keys. */
  AI_KEY_SECRET?: string;
  /** Web Push (docs/alerts.md): the VAPID public key (a variable) and private scalar (a secret). */
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  /** Contact the push services may write to: "mailto:…". */
  VAPID_SUBJECT?: string;
  /** Comma-separated extra origins allowed to send writes (local development). */
  ALLOWED_ORIGINS: string;
  /** Ingest requests a device may send per minute; ingest.ts has the default. */
  INGEST_REQUESTS_PER_MINUTE?: string;
  /** Days of retention (rollups.ts has the defaults): minutes, and per-second values. */
  RETENTION_1M_DAYS?: string;
  RETENTION_1S_DAYS?: string;
  /** D1 size limit in MB, for the app's warning (500 on the free plan). */
  DATABASE_LIMIT_MB?: string;
  /** Rows D1 may read per UTC day, for the app's warning (5 000 000 on the free plan). */
  ROWS_READ_LIMIT?: string;
  /**
   * Secret (wrangler secret put ADMIN_EMAILS): the administrators' emails,
   * comma-separated; they see the server's panel in Definições (docs/admin.md).
   */
  ADMIN_EMAILS?: string;
  /** Google Drive sign-in in the local mode (docs/google-drive.md): the client id (a variable) and the secret. */
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}

/** The VAPID keys, or undefined when the Worker has none (no alerts then). */
export function vapidKeys(env: Env): VapidKeys | undefined {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return undefined;
  return {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    subject: env.VAPID_SUBJECT || 'mailto:wattometro@outlook.com',
  };
}

/** The Google OAuth client, or undefined when the Worker has none (no Google Drive then). */
export function googleApp(env: Env): GoogleApp | undefined {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return undefined;
  return { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET };
}

export function adminEmails(env: Env): string[] {
  return (env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email !== '');
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
