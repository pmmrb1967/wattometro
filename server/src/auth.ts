// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Who is calling (adapted from poderebeleza, worker/auth.ts):
 * - people: email + password (password.ts), then a session in a signed
 *   HttpOnly/Secure/SameSite=Strict cookie (HMAC-SHA256 with SESSION_SECRET);
 * - Shelly devices: a per-device bearer token, stored only as its SHA-256
 *   (a random 256-bit token needs no slow hash).
 *
 * The session carries the user's session_version, so raising it in the
 * database (e.g. on a password change) signs the user out everywhere.
 * Sessions slide: one used more than RENEW_AFTER_SECONDS after it was issued
 * is replaced by a fresh one, so only SESSION_SECONDS without use sign out.
 */
import { z } from 'zod';
import type { Sql } from './db';
import { fromBase64Url, toBase64Url } from '../../src/lib/base64url';
import { DUMMY_HASH, hashPassword, verifyPassword } from './password';
import {
  clearLoginFailures,
  findUserByEmail,
  getUser,
  lockedFor,
  recordLoginFailure,
  setPasswordHash,
  type LoginLimits,
  type User,
} from './repo/users';

export const SESSION_COOKIE = 'wm_session';
export const SESSION_SECONDS = 30 * 24 * 3600;
export const RENEW_AFTER_SECONDS = 24 * 3600;
/** Failures of one email from one address before it is locked (from there only). */
export const MAX_LOGIN_FAILURES = 5;
/** Failures from one address, whatever the emails, before the address is locked. */
export const MAX_ADDRESS_FAILURES = 20;
/** How long a lock lasts, and how long a failure counts. */
export const LOCK_SECONDS = 15 * 60;
export const LOGIN_LIMITS: LoginLimits = {
  maxFailures: MAX_LOGIN_FAILURES,
  maxAddressFailures: MAX_ADDRESS_FAILURES,
  lockSeconds: LOCK_SECONDS,
};
export const MIN_SECRET_LENGTH = 32;

const encoder = new TextEncoder();

const SessionPayload = z.object({ uid: z.string(), ver: z.number().int(), exp: z.number().int() });

async function hmacKey(secret: string): Promise<CryptoKey> {
  if (secret.length < MIN_SECRET_LENGTH) throw new Error('SESSION_SECRET missing or too short');
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

/**
 * The caller's address as it is kept for the login limits: an HMAC with
 * SESSION_SECRET, so the database never holds it, nor a hash anyone could
 * reverse by trying every IPv4 address. `ip` is CF-Connecting-IP, which
 * Cloudflare sets (the API is reached only through the app's Worker,
 * gateway.ts); without it (tests, local development) every caller is one.
 */
export async function addressKey(ip: string | undefined, secret: string): Promise<string> {
  const data = encoder.encode(`login-address:${ip ?? 'unknown'}`);
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), data);
  return toBase64Url(new Uint8Array(signature).slice(0, 16));
}

export async function signSession(user: User, secret: string, now: number): Promise<string> {
  const payload = { uid: user.id, ver: user.sessionVersion, exp: now + SESSION_SECONDS };
  const data = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(data));
  return `${data}.${toBase64Url(new Uint8Array(signature))}`;
}

export interface Session {
  user: User;
  /** True when the cookie should be replaced by a fresh one (sliding expiry). */
  renew: boolean;
}

/** A valid, unexpired session whose account still exists and was not signed out. */
export async function readSession(
  sql: Sql,
  token: string,
  secret: string,
  now: number,
): Promise<Session | null> {
  const [data, signature, extra] = token.split('.');
  if (!data || !signature || extra !== undefined) return null;
  try {
    const valid = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(secret),
      fromBase64Url(signature),
      encoder.encode(data),
    );
    if (!valid) return null;
    const payload = SessionPayload.parse(JSON.parse(new TextDecoder().decode(fromBase64Url(data))));
    if (payload.exp <= now) return null;
    const user = await getUser(sql, payload.uid);
    if (!user || user.sessionVersion !== payload.ver) return null;
    return { user, renew: payload.exp - now < SESSION_SECONDS - RENEW_AFTER_SECONDS };
  } catch {
    return null;
  }
}

/** Prefix of device tokens; a new token format would change it. */
export const DEVICE_TOKEN_PREFIX = 'wm1_';

/** A new device token (shown once to the user; only its hash is stored). */
export function newDeviceToken(): string {
  return DEVICE_TOKEN_PREFIX + toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

/** SHA-256 of a device token, hex: what devices.token_hash holds. */
export async function hashDeviceToken(token: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(token)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export type LoginResult =
  | { ok: true; user: User }
  | { ok: false; reason: 'invalid' }
  | { ok: false; reason: 'locked'; retryAfter: number };

/**
 * Checks email and password. Repeated failures lock the email from that
 * address (`address`: addressKey), and many lock the address itself, so
 * whoever knows an email cannot lock its owner out.
 */
export async function login(
  sql: Sql,
  email: string,
  password: string,
  address: string,
  now: number,
): Promise<LoginResult> {
  const wait = await lockedFor(sql, email, address, now);
  if (wait > 0) return { ok: false, reason: 'locked', retryAfter: wait };

  const user = await findUserByEmail(sql, email);
  const matches = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (user && matches) {
    await clearLoginFailures(sql, email, address);
    const { id, householdId, email: userEmail, sessionVersion } = user;
    return { ok: true, user: { id, householdId, email: userEmail, sessionVersion } };
  }
  await recordLoginFailure(sql, email, address, now, LOGIN_LIMITS);
  return { ok: false, reason: 'invalid' };
}

export type PasswordChangeResult =
  | { ok: true; user: User }
  | { ok: false; reason: 'invalid' }
  | { ok: false; reason: 'locked'; retryAfter: number };

/**
 * Sets a new password after checking the current one (with the same lockout as
 * the login). Raises session_version: every other device is signed out.
 */
export async function changePassword(
  sql: Sql,
  user: User,
  currentPassword: string,
  newPassword: string,
  address: string,
  now: number,
): Promise<PasswordChangeResult> {
  const check = await login(sql, user.email, currentPassword, address, now);
  if (!check.ok) return check;
  const updated = await setPasswordHash(sql, user.id, await hashPassword(newPassword));
  return updated ? { ok: true, user: updated } : { ok: false, reason: 'invalid' };
}
