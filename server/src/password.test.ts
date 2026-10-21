// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { DUMMY_HASH, hashPassword, PASSWORD_ITERATIONS, verifyPassword } from './password';

describe('password hashing', () => {
  it('verifies the right password only', async () => {
    const stored = await hashPassword('correta e comprida', 1000);
    expect(await verifyPassword('correta e comprida', stored)).toBe(true);
    expect(await verifyPassword('errada', stored)).toBe(false);
  });

  it('uses a fresh salt each time', async () => {
    expect(await hashPassword('igual', 1000)).not.toBe(await hashPassword('igual', 1000));
  });

  it('stores the algorithm and the iteration count', async () => {
    expect(await hashPassword('x', 1000)).toMatch(/^pbkdf2-sha256\$1000\$[\w-]{22}\$[\w-]{43}$/);
  });

  it('defaults to the Workers maximum', async () => {
    expect((await hashPassword('x')).split('$')[1]).toBe(String(PASSWORD_ITERATIONS));
  });

  it('rejects malformed or out-of-range hashes', async () => {
    expect(await verifyPassword('x', 'md5$1$a$b')).toBe(false);
    expect(await verifyPassword('x', `pbkdf2-sha256$${PASSWORD_ITERATIONS + 1}$AA$AA`)).toBe(false);
    expect(await verifyPassword('x', 'pbkdf2-sha256$0$AA$AA')).toBe(false);
    expect(await verifyPassword('x', 'garbage')).toBe(false);
  });

  it('never matches the dummy hash used for unknown emails', async () => {
    expect(await verifyPassword('', DUMMY_HASH)).toBe(false);
  });
});
