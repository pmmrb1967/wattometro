// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Installs or updates shelly/wattometro.js on the Shelly at home, from this
 * computer on the same network (nothing changes if it is already there):
 *
 *   pnpm shelly:install
 *
 * Reads SHELLY_HOST and SHELLY_PASSWORD from .env (never committed; see
 * .env.example). Creates the script "wattometro" if missing, uploads the code,
 * turns on "Run on startup", restarts it and checks the code on the device is
 * the repository's. The URL and token in KVS are left alone (shelly/README.md,
 * step 3); it only says whether they are set.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { parseEnv, shellyRpc } from './shelly/rpc';

const NAME = 'wattometro';
const CHUNK = 1024;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const envPath = resolve('.env');
const env = existsSync(envPath) ? parseEnv(readFileSync(envPath, 'utf8')) : {};
const host = env.SHELLY_HOST || fail('Set SHELLY_HOST in .env (see .env.example).');
const rpc = shellyRpc(host, env.SHELLY_PASSWORD || undefined);
const code = readFileSync(resolve('shelly', 'wattometro.js'), 'utf8');
const version = /SCRIPT_VERSION = '([^']+)'/.exec(code)?.[1] ?? '?';

const List = z.object({
  scripts: z.array(z.object({ id: z.number(), name: z.string().nullable(), running: z.boolean() })),
});
const Code = z.object({ data: z.string(), left: z.number() });

async function codeOnDevice(id: number): Promise<string> {
  let text = '';
  for (;;) {
    const part = Code.parse(await rpc('Script.GetCode', { id, offset: text.length }));
    text += part.data;
    if (part.left <= 0 || part.data.length === 0) return text;
  }
}

try {
  const { scripts } = List.parse(await rpc('Script.List'));
  let script = scripts.find((s) => s.name === NAME);
  if (!script) {
    const { id } = z.object({ id: z.number() }).parse(await rpc('Script.Create', { name: NAME }));
    script = { id, name: NAME, running: false };
    console.log(`Created script ${NAME} (id ${id}).`);
  }
  const id = script.id;
  await rpc('Script.SetConfig', { id, config: { enable: true } });
  // The same code already running: leave it, so no minute is lost.
  if (script.running && (await codeOnDevice(id)) === code) {
    console.log(`Script ${version} already up to date on ${host}.`);
  } else {
    if (script.running) await rpc('Script.Stop', { id });
    for (let offset = 0; offset < code.length; offset += CHUNK) {
      const chunk = code.slice(offset, offset + CHUNK);
      await rpc('Script.PutCode', { id, code: chunk, append: offset > 0 });
    }
    await rpc('Script.Start', { id });
    if ((await codeOnDevice(id)) !== code) {
      fail('The code on the Shelly differs from shelly/wattometro.js.');
    }
    console.log(`Script ${version} installed and running on ${host}, starting with the Shelly.`);
  }

  const configured = await Promise.all(
    ['url', 'token'].map((key) =>
      rpc('KVS.Get', { key: `${NAME}.${key}` }).then(
        () => true,
        () => false,
      ),
    ),
  );
  if (configured.includes(false)) {
    console.log('URL or token missing in KVS: see shelly/README.md, step 3.');
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
