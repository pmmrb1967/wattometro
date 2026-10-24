// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { digestAuth, parseChallenge, parseEnv } from './rpc';

describe('digestAuth', () => {
  it('follows the Shelly digest (SHA-256, dummy method and URI)', () => {
    // Expected value computed separately with Python's hashlib.
    const auth = digestAuth({ realm: 'shellyemg3-000000000000', nonce: 'AbC123==' }, 'segredo', 42);
    expect(auth).toEqual({
      realm: 'shellyemg3-000000000000',
      username: 'admin',
      nonce: 'AbC123==',
      cnonce: 42,
      nc: '00000001',
      response: 'e7889673dc9699bad9ac2c2a1ca84c5dea41d0424335c39d5d83a51ab9217d6d',
      algorithm: 'SHA-256',
    });
  });
});

describe('parseChallenge', () => {
  it('reads realm and nonce from the header', () => {
    expect(
      parseChallenge(
        'Digest qop="auth", realm="shellyemg3-000000000000", nonce="6iry+3dO=", algorithm=SHA-256',
      ),
    ).toEqual({ realm: 'shellyemg3-000000000000', nonce: '6iry+3dO=' });
    expect(parseChallenge(null)).toBeNull();
  });
});

describe('parseEnv', () => {
  it('keeps only SHELLY_ lines, as written, with Windows line ends', () => {
    expect(
      parseEnv('# comment\r\nSHELLY_HOST=192.168.1.50\r\nSHELLY_PASSWORD=a=b c\r\nOTHER=x\r\n'),
    ).toEqual({ SHELLY_HOST: '192.168.1.50', SHELLY_PASSWORD: 'a=b c' });
  });
});
