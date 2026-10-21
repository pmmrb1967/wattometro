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

/** Seconds until the email may try again, or 0. */
export async function lockedFor(sql: Sql, email: string, now: number): Promise<number> {
  const row = await sql.first<{ locked_until: number | null }>(
    'SELECT locked_until FROM login_attempts WHERE email = ?',
    normalizeEmail(email),
  );
  return row?.locked_until && row.locked_until > now ? row.locked_until - now : 0;
}

/**
 * Counts a failed login; at `maxFailures` the email is locked for `lockSeconds`.
 * A failure after a lock has expired starts counting again from one.
 */
export async function recordLoginFailure(
  sql: Sql,
  email: string,
  now: number,
  maxFailures: number,
  lockSeconds: number,
): Promise<void> {
  await sql.run(
    `INSERT INTO login_attempts (email, failures, locked_until) VALUES (?1, 1, CASE WHEN ?2 <= 1 THEN ?3 + ?4 END)
     ON CONFLICT (email) DO UPDATE SET
       failures = CASE WHEN locked_until IS NOT NULL THEN 1 ELSE failures + 1 END,
       locked_until = CASE
         WHEN locked_until IS NULL AND failures + 1 >= ?2 THEN ?3 + ?4
         ELSE NULL
       END`,
    normalizeEmail(email),
    maxFailures,
    now,
    lockSeconds,
  );
}

export async function clearLoginFailures(sql: Sql, email: string): Promise<void> {
  await sql.run('DELETE FROM login_attempts WHERE email = ?', normalizeEmail(email));
}
