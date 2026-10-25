// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Fills the minutes the server missed (D1 unavailable, the Shelly offline for
 * longer than its queue) from the Shelly's own minute log, which keeps at least
 * 10 days (docs/shelly.md, "Registo interno"). From this computer, on the same
 * network as the Shelly:
 *
 *   pnpm shelly:backfill [--days 10] [--channel 0] [--dry]
 *
 * Asks the server which minutes it lacks (GET /v1/ingest/missing), reads them
 * from the Shelly (EM1Data.GetData) and sends them as the script does
 * (POST /v1/ingest, the device token). The last hour is left to the script,
 * whose minutes bring the per-second values: a minute sent here first would
 * make the script's a duplicate. The log has no per-second values.
 *
 * Reads SHELLY_HOST, SHELLY_PASSWORD, SHELLY_INGEST_URL and SHELLY_DEVICE_TOKEN
 * from .env (never committed).
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { z } from 'zod';
import { LogData, logMinutes, toIngestMinutes, type IngestMinute } from './shelly/backfill';
import { parseEnv, shellyRpc } from './shelly/rpc';

/** As server/src/ingest.ts. */
const MINUTES_PER_REQUEST = 20;
/** Under the server's 20 requests a minute per device, leaving room for the script. */
const PAUSE_MS = 4_000;
const KEEP_FOR_SCRIPT_S = 3600;
const MAX_DAYS = 10;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function option(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return fallback;
  const value = Number(process.argv[index + 1]);
  if (!Number.isInteger(value)) fail(`--${name} wants a whole number`);
  return value;
}

const envPath = resolve('.env');
const env = existsSync(envPath) ? parseEnv(readFileSync(envPath, 'utf8')) : {};
const host = env.SHELLY_HOST || fail('Set SHELLY_HOST in .env (see .env.example).');
const ingestUrl = env.SHELLY_INGEST_URL || fail('Set SHELLY_INGEST_URL in .env.');
const token = env.SHELLY_DEVICE_TOKEN || fail('Set SHELLY_DEVICE_TOKEN in .env.');
const rpc = shellyRpc(host, env.SHELLY_PASSWORD || undefined);
const days = Math.min(MAX_DAYS, Math.max(1, option('days', MAX_DAYS)));
const channel = option('channel', 0);
const dry = process.argv.includes('--dry');
const auth = { Authorization: `Bearer ${token}` };

const now = Math.floor(Date.now() / 1000);
const to = Math.floor((now - KEEP_FOR_SCRIPT_S) / 60) * 60;
const from = to - days * 86_400;

const missingUrl = `${ingestUrl.replace(/\/v1\/ingest\/?$/, '')}/v1/ingest/missing?c=${channel}&from=${from}&to=${to}`;
const missingResponse = await fetch(missingUrl, { headers: auth });
if (!missingResponse.ok) {
  fail(`The server said ${missingResponse.status} to the list of missing minutes.`);
}
const { missing } = z
  .object({ missing: z.array(z.tuple([z.number().int(), z.number().int()])) })
  .parse(await missingResponse.json());
const lacking = missing.reduce((sum, [start, end]) => sum + (end - start) / 60, 0);
const when = (ts: number) => new Date(ts * 1000).toISOString().slice(0, 16).replace('T', ' ');
console.log(
  `Channel ${channel}, ${when(from)} to ${when(to)} UTC: the server lacks ${lacking} minutes in ${missing.length} gaps.`,
);

/** The Shelly's log of [start, end), page by page. */
async function readLog(start: number, end: number): Promise<IngestMinute[]> {
  const pages: LogData[] = [];
  for (let ts: number | undefined = start; ts !== undefined && ts < end;) {
    const page = LogData.parse(await rpc('EM1Data.GetData', { id: channel, ts, end_ts: end - 60 }));
    pages.push(page);
    ts =
      page.next_record_ts !== undefined && page.next_record_ts > ts
        ? page.next_record_ts
        : undefined;
  }
  return toIngestMinutes(
    pages.flatMap((page) => logMinutes(page, start, end)),
    channel,
  );
}

async function send(minutes: IngestMinute[]): Promise<{ stored: number; duplicates: number }> {
  for (;;) {
    const response = await fetch(ingestUrl, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ v: 1, sv: 'backfill', min: minutes }),
    });
    if (response.status === 429) {
      await sleep(1000 * Number(response.headers.get('Retry-After') ?? 60));
      continue;
    }
    if (!response.ok) fail(`The server said ${response.status} to a batch of minutes.`);
    return z.object({ stored: z.number(), duplicates: z.number() }).parse(await response.json());
  }
}

let found = 0;
let stored = 0;
let duplicates = 0;
for (const [start, end] of missing) {
  const minutes = await readLog(start, end);
  found += minutes.length;
  console.log(
    `${when(start)}–${when(end)}: ${(end - start) / 60} missing, ${minutes.length} in the Shelly's log`,
  );
  if (dry) continue;
  for (let i = 0; i < minutes.length; i += MINUTES_PER_REQUEST) {
    const outcome = await send(minutes.slice(i, i + MINUTES_PER_REQUEST));
    stored += outcome.stored;
    duplicates += outcome.duplicates;
    await sleep(PAUSE_MS);
  }
}
console.log(
  dry
    ? `Dry run: ${found} of the ${lacking} missing minutes are in the Shelly's log; nothing sent.`
    : `${stored} minutes stored, ${duplicates} already there, ${lacking - found} not in the Shelly's log either.`,
);
