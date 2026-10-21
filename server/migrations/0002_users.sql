-- SPDX-License-Identifier: AGPL-3.0-or-later
-- Own login (Cloudflare Zero Trust needs a credit card even on the free plan).
-- Accounts are created only by scripts/create-user.ts; there is no public sign-up.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  -- Lower-case, trimmed.
  email TEXT NOT NULL UNIQUE,
  -- pbkdf2-sha256$<iterations>$<salt>$<hash> (base64url); see server/src/password.ts.
  password_hash TEXT NOT NULL,
  -- Part of every session token: raising it signs the user out everywhere.
  session_version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE INDEX users_household ON users (household_id);

-- Failed logins per email, to lock out brute force.
CREATE TABLE login_attempts (
  email TEXT PRIMARY KEY,
  failures INTEGER NOT NULL,
  locked_until INTEGER
);
