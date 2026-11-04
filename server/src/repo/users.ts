// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Sql } from '../db';

export interface User {
  id: string;
  householdId: string;
  email: string;
  sessionVersion: number;
}

export interface UserWithPassword extends User {
  passwordHash: string;
}

interface UserRow {
  id: string;
  household_id: string;
  email: string;
  session_version: number;
}

const fromRow = (row: UserRow): User => ({
  id: row.id,
  householdId: row.household_id,
  email: row.email,
  sessionVersion: row.session_version,
});

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export async function createUser(
  sql: Sql,
  user: { householdId: string; email: string; passwordHash: string },
  now: number,
): Promise<User> {
  const id = crypto.randomUUID();
  const email = normalizeEmail(user.email);
  await sql.run(
    'INSERT INTO users (id, household_id, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)',
    id,
    user.householdId,
    email,
    user.passwordHash,
    now,
  );
  return { id, householdId: user.householdId, email, sessionVersion: 1 };
}

export async function findUserByEmail(sql: Sql, email: string): Promise<UserWithPassword | null> {
  const row = await sql.first<UserRow & { password_hash: string }>(
    'SELECT id, household_id, email, session_version, password_hash FROM users WHERE email = ?',
    normalizeEmail(email),
  );
  return row ? { ...fromRow(row), passwordHash: row.password_hash } : null;
}

export async function getUser(sql: Sql, id: string): Promise<User | null> {
  const row = await sql.first<UserRow>(
    'SELECT id, household_id, email, session_version FROM users WHERE id = ?',
    id,
  );
  return row ? fromRow(row) : null;
}

/** Stores a new password hash and ends every session; the updated user, or null if gone. */
export async function setPasswordHash(
  sql: Sql,
  userId: string,
  passwordHash: string,
): Promise<User | null> {
  await sql.run(
    'UPDATE users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?',
    passwordHash,
    userId,
  );
  return getUser(sql, userId);
}

/** How many failures lock, and for how long; failures older than `lockSeconds` are forgotten. */
export interface LoginLimits {
  /** Failures of one email from one address. */
  maxFailures: number;
  /** Failures from one address, whatever the emails. */
  maxAddressFailures: number;
  lockSeconds: number;
}

/**
 * Seconds until this email may try again from this address (an HMAC of it:
 * auth.ts, addressKey), or 0: the email from that address, or the address
 * itself, may be locked.
 */
export async function lockedFor(
  sql: Sql,
  email: string,
  address: string,
  now: number,
): Promise<number> {
  const row = await sql.first<{ until: number | null }>(
    `SELECT MAX(until) AS until FROM (
       SELECT locked_until AS until FROM login_attempts WHERE email = ?1 AND address = ?2
       UNION ALL
       SELECT locked_until FROM login_addresses WHERE address = ?2
     )`,
    normalizeEmail(email),
    address,
  );
  return row?.until && row.until > now ? row.until - now : 0;
}

/**
 * Counts a failed login, for the email from this address and for the address:
 * at the limit, that one is locked for `lockSeconds`. A failure after a lock has
 * expired, or after `lockSeconds` without failures, counts from one again.
 */
export async function recordLoginFailure(
  sql: Sql,
  email: string,
  address: string,
  now: number,
  limits: LoginLimits,
): Promise<void> {
  await purgeLoginFailures(sql, now, limits.lockSeconds);
  const counting = `
       failures = CASE WHEN locked_until IS NOT NULL THEN 1 ELSE failures + 1 END,
       last_at = ?2,
       locked_until = CASE
         WHEN locked_until IS NULL AND failures + 1 >= ?3 THEN ?2 + ?4
         ELSE NULL
       END`;
  await sql.run(
    `INSERT INTO login_attempts (address, last_at, failures, locked_until, email)
       VALUES (?1, ?2, 1, CASE WHEN ?3 <= 1 THEN ?2 + ?4 END, ?5)
     ON CONFLICT (email, address) DO UPDATE SET ${counting}`,
    address,
    now,
    limits.maxFailures,
    limits.lockSeconds,
    normalizeEmail(email),
  );
  await sql.run(
    `INSERT INTO login_addresses (address, last_at, failures, locked_until)
       VALUES (?1, ?2, 1, CASE WHEN ?3 <= 1 THEN ?2 + ?4 END)
     ON CONFLICT (address) DO UPDATE SET ${counting}`,
    address,
    now,
    limits.maxAddressFailures,
    limits.lockSeconds,
  );
}

/** After a successful login: the email starts again from this address. */
export async function clearLoginFailures(sql: Sql, email: string, address: string): Promise<void> {
  await sql.run(
    'DELETE FROM login_attempts WHERE email = ? AND address = ?',
    normalizeEmail(email),
    address,
  );
}

/**
 * Forgets the failures `windowSeconds` after the last one, once no lock is on
 * (on each failure, and by the Cron: rollups.ts). Both tables stay a few rows.
 */
export async function purgeLoginFailures(
  sql: Sql,
  now: number,
  windowSeconds: number,
): Promise<void> {
  for (const table of ['login_attempts', 'login_addresses']) {
    await sql.run(
      `DELETE FROM ${table} WHERE last_at <= ?1 AND (locked_until IS NULL OR locked_until <= ?2)`,
      now - windowSeconds,
      now,
    );
  }
}
