-- Failed logins per email and address, and per address alone (auth.ts): whoever
-- knows an email no longer locks its owner out, as with login_attempts by email
-- only (0002). The address is kept only as an HMAC with SESSION_SECRET
-- (auth.ts, addressKey), and each row is forgotten 15 minutes after its last
-- failure, once its lock is over (repo/users.ts, purgeLoginFailures).
DROP TABLE login_attempts;

CREATE TABLE login_attempts (
  email TEXT NOT NULL,
  address TEXT NOT NULL,
  failures INTEGER NOT NULL,
  last_at INTEGER NOT NULL,
  locked_until INTEGER,
  PRIMARY KEY (email, address)
);

CREATE TABLE login_addresses (
  address TEXT PRIMARY KEY,
  failures INTEGER NOT NULL,
  last_at INTEGER NOT NULL,
  locked_until INTEGER
);
