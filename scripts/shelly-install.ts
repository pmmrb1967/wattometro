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
 * the repository's. It also schedules Script.Start every 5 minutes, so a script
 * stopped by anything (e.g. out of memory) comes back without a reboot; starting
 * a running script does nothing.
 *
 * The URL and token: the EM Gen3 empties its KVS on every reboot (docs/shelly.md,
 * "KVS"). With SHELLY_INGEST_URL and SHELLY_DEVICE_TOKEN in .env, they are
 * written into the uploaded copy of the script (scripts/shelly/embed.ts), which
 * survives a reboot, and into KVS when missing or different, handing them to
 * the running script too so the minutes it has queued are sent without a restart.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { embedConfig } from './shelly/embed';
import { parseEnv, shellyRpc } from './shelly/rpc';

const NAME = 'wattometro';
const CHUNK = 1024;
const WATCHDOG = '0 */5 * * * *'; // second minute hour day month weekday

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const envPath = resolve('.env');
const env = existsSync(envPath) ? parseEnv(readFileSync(envPath, 'utf8')) : {};
const host = env.SHELLY_HOST || fail('Set SHELLY_HOST in .env (see .env.example).');
const rpc = shellyRpc(host, env.SHELLY_PASSWORD || undefined);
const source = readFileSync(resolve('shelly', 'wattometro.js'), 'utf8');
const version = /SCRIPT_VERSION = '([^']+)'/.exec(source)?.[1] ?? '?';
const wanted = { url: env.SHELLY_INGEST_URL, token: env.SHELLY_DEVICE_TOKEN };
const code =
  wanted.url && wanted.token
    ? embedConfig(source, { url: wanted.url, token: wanted.token })
    : source;

const List = z.object({
  scripts: z.array(z.object({ id: z.number(), name: z.string().nullable(), running: z.boolean() })),
});
const Code = z.object({ data: z.string(), left: z.number() });
const Value = z.object({ value: z.string() });
const Jobs = z.object({
  jobs: z.array(
    z.object({
      id: z.number(),
      calls: z.array(z.object({ method: z.string(), params: z.unknown().optional() })),
    }),
  ),
});

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
      fail('The code on the Shelly differs from the one uploaded.');
    }
    console.log(`Script ${version} installed and running on ${host}, starting with the Shelly.`);
  }

  const { jobs } = Jobs.parse(await rpc('Schedule.List'));
  const watched = jobs.some((job) =>
    job.calls.some(
      (call) =>
        call.method.toLowerCase() === 'script.start' &&
        z.object({ id: z.literal(id) }).safeParse(call.params).success,
    ),
  );
  if (!watched) {
    await rpc('Schedule.Create', {
      enable: true,
      timespec: WATCHDOG,
      calls: [{ method: 'Script.Start', params: { id } }],
    });
    console.log('Scheduled a restart check every 5 minutes.');
  }

  if (code === source) {
    console.log(
      'No SHELLY_INGEST_URL / SHELLY_DEVICE_TOKEN in .env: the script relies on KVS alone, which a reboot empties.',
    );
  }
  const stored = Object.fromEntries(
    await Promise.all(
      (['url', 'token'] as const).map(async (key) => {
        const value = await rpc('KVS.Get', { key: `${NAME}.${key}` }).then(
          (result) => Value.parse(result).value,
          () => null,
        );
        return [key, value] as const;
      }),
    ),
  ) as Record<'url' | 'token', string | null>;
  const toWrite = (['url', 'token'] as const).filter(
    (key) => wanted[key] && stored[key] !== wanted[key],
  );
  for (const key of toWrite) {
    await rpc('KVS.Set', { key: `${NAME}.${key}`, value: wanted[key] });
  }
  if (toWrite.length > 0) {
    // The script reads KVS only when it starts: give it the values now.
    const assignments = toWrite.map((key) => `cfg.${key}=${JSON.stringify(wanted[key])};`);
    await rpc('Script.Eval', { id, code: `${assignments.join('')}true` });
    console.log(`Wrote ${toWrite.join(' and ')} to KVS and to the running script.`);
  }
  const missing = (['url', 'token'] as const).filter((key) => !stored[key] && !wanted[key]);
  if (missing.length > 0) {
    console.log(
      `${missing.join(' and ')} missing in KVS: set SHELLY_INGEST_URL / SHELLY_DEVICE_TOKEN in .env, or see shelly/README.md, step 3.`,
    );
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
