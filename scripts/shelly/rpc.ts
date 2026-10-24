// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * RPC to a Shelly Gen2+ on the home network, with the local password when the
 * device has one (Settings → Authentication; user always "admin"). Digest
 * SHA-256 as in docs/shelly.md, "Autenticação" — curl on Windows (Schannel)
 * cannot do it, hence this.
 */
import { createHash, randomInt } from 'node:crypto';
import { z } from 'zod';

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

export interface Challenge {
  realm: string;
  nonce: string;
}

/** Realm and nonce of a `WWW-Authenticate: Digest …` header; null if absent. */
export function parseChallenge(header: string | null): Challenge | null {
  const realm = header && /realm="([^"]*)"/.exec(header)?.[1];
  const nonce = header && /nonce="([^"]*)"/.exec(header)?.[1];
  return realm && nonce ? { realm, nonce } : null;
}

/** The `auth` object of an RPC request (RPC transports hash dummy method and URI). */
export function digestAuth(challenge: Challenge, password: string, cnonce: number) {
  const nc = '00000001';
  const ha1 = sha256(`admin:${challenge.realm}:${password}`);
  const ha2 = sha256('dummy_method:dummy_uri');
  return {
    realm: challenge.realm,
    username: 'admin',
    nonce: challenge.nonce,
    cnonce,
    nc,
    response: sha256(`${ha1}:${challenge.nonce}:${nc}:${cnonce}:auth:${ha2}`),
    algorithm: 'SHA-256',
  };
}

/** SHELLY_* lines of a .env file (no quotes, no expansion). */
export function parseEnv(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^(SHELLY_[A-Z_]+)=(.*)$/.exec(line);
    if (match) env[match[1]!] = match[2]!.trim();
  }
  return env;
}

const RpcAnswer = z.union([
  z.object({ result: z.unknown() }),
  z.object({ error: z.object({ code: z.number(), message: z.string() }) }),
]);

export class ShellyError extends Error {}

export type Rpc = (method: string, params?: Record<string, unknown>) => Promise<unknown>;

/** RPC over HTTP; answers a digest challenge once when there is a password. */
export function shellyRpc(host: string, password: string | undefined): Rpc {
  return async (method, params = {}) => {
    const url = `http://${host}/rpc`;
    const request = { id: 1, method, params };
    let response = await fetch(url, { method: 'POST', body: JSON.stringify(request) });
    if (response.status === 401) {
      const challenge = parseChallenge(response.headers.get('www-authenticate'));
      if (!password || !challenge) {
        throw new ShellyError('the Shelly asks for a password: set SHELLY_PASSWORD in .env');
      }
      const auth = digestAuth(challenge, password, randomInt(1, 2 ** 31));
      response = await fetch(url, { method: 'POST', body: JSON.stringify({ ...request, auth }) });
      if (response.status === 401) throw new ShellyError('wrong SHELLY_PASSWORD');
    }
    const answer = RpcAnswer.parse(await response.json());
    if ('error' in answer) throw new ShellyError(`${method}: ${answer.error.message}`);
    return answer.result;
  };
}
