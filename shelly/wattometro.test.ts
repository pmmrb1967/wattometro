// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Runs shelly/wattometro.js in Node against a simulated Shelly and the real
 * server (SQLite in memory). It checks the script's logic and its payloads;
 * the Shelly's own interpreter and limits are still to be confirmed on a
 * device (docs/shelly.md).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { createContext, runInContext, type Context } from 'node:vm';
import { beforeEach, describe, expect, it } from 'vitest';
import { embedConfig } from '../scripts/shelly/embed';
import { memorySql } from '../server/test/sqlite';
import { createApp } from '../server/src/app';
import { hashDeviceToken } from '../server/src/auth';
import { createDevice } from '../server/src/repo/devices';
import { createHousehold } from '../server/src/repo/households';
import { decodeSeconds } from '../src/lib/readings-1s';

const SOURCE = readFileSync(join(__dirname, 'wattometro.js'), 'utf8');
const URL = 'https://app.example/v1/ingest';
const TOKEN = 'wm1_test-token';
const START = 1_792_000_000 - (1_792_000_000 % 60) + 50; // 10 s before a minute starts

/**
 * Script memory as measured on a Shelly EM Gen3 (docs/shelly.md, 2026-10-24):
 * 25.2 KB in all, ~7 KB in use with an empty queue, ~1.2 bytes per byte of
 * queued text, and a request peaking at ~3.3 KB plus 4 × its body.
 */
const MEMORY = { total: 25_200, base: 7_000, perQueuedByte: 1.2, perEntry: 80 };
const SEND = { overhead: 3_300, perBodyByte: 4 };
const QUEUED_BYTES = `(function () {
  var n = done === null ? 0 : 1000;
  for (var i = 0; i < queue.length; i++) {
    n += ${MEMORY.perEntry} + ${MEMORY.perQueuedByte} * (queue[i].a.length + (queue[i].s === null ? 0 : queue[i].s.length));
  }
  return n;
})()`;
const BOOT = START - 3600;

type Callback = (result: unknown, errorCode: number, errorMessage: string) => void;

interface Request {
  method: string;
  url: string;
  body: string;
  headers: Record<string, string>;
}

/** EM1Data.GetData keys and page size, as on the EM Gen3 (docs/shelly.md, "Registo interno"). */
const LOG_KEYS = [
  'total_act_energy',
  'total_act_ret_energy',
  'lag_react_energy',
  'lead_react_energy',
  'max_act_power',
  'min_act_power',
  'max_aprt_power',
  'min_aprt_power',
  'max_voltage',
  'min_voltage',
  'avg_voltage',
  'max_current',
  'min_current',
  'avg_current',
];
const LOG_PAGE = 28;
const VOLTAGE = 231.24;

class FakeShelly {
  clock = START;
  /** Wh measured so far (with decimals). */
  counter = 1234.4;
  /**
   * Wh as the Shelly reports it: like the real EM Gen3 (docs/shelly.md), the
   * total moves once a minute, about 1 s after the minute, to the energy at
   * that minute's start.
   */
  reported = this.counter;
  private atMinute = this.counter;
  power = (second: number) => 400 + (second % 60);
  /** A whole EM1.GetStatus answer to return instead of the simulated one. */
  em1: Record<string, unknown> | null = null;
  online = true;
  /** Highest script memory in use so far, and whether it ran out (as the device would). */
  memPeak = 0;
  outOfMemory = false;
  /** Seconds when free memory dips to 5 KB, as transient allocations do. */
  dip: (clock: number) => boolean = () => false;
  timeSynced = true;
  /** Seconds the device's unixtime is off by (an hour ahead on 2026-10-25). */
  skew = 0;
  kvs: Record<string, string> = { 'wattometro.url': URL, 'wattometro.token': TOKEN };
  /** The script as uploaded (pnpm shelly:install embeds the URL and token). */
  source = SOURCE;
  /** POST /v1/ingest requests; the GETs for gaps go in `gets`. */
  requests: Request[] = [];
  gets: Request[] = [];
  /** The device's own minute log (EM1Data), kept whether the script runs or not. */
  log = new Map<number, number[]>();
  logReads = 0;
  private minute: { t: number; wh: number; powers: number[] } | null = null;
  logs: string[] = [];
  private tick: (() => void) | null = null;
  private context: Context | null = null;
  private pending: Promise<void> = Promise.resolve();

  private readonly app: ReturnType<typeof createApp>;

  constructor(app: ReturnType<typeof createApp>) {
    this.app = app;
  }

  run() {
    const shelly = {
      getDeviceInfo: () => ({ model: 'S3EM-002CXCEU', ver: '1.4.4' }),
      getCurrentScriptId: () => 1,
      getComponentStatus: (type: string) => {
        switch (type) {
          case 'sys':
            return {
              unixtime: this.timeSynced ? this.clock + this.skew : null,
              uptime: this.clock - BOOT + 0.4,
            };
          case 'em1': {
            if (this.em1) return this.em1;
            const p = this.power(this.clock);
            return { id: 0, voltage: 231.24, act_power: p + 0.4, aprt_power: (p + 0.4) / 0.9 };
          }
          case 'em1data':
            return { id: 0, total_act_energy: this.reported };
          case 'script':
            if (this.dip(this.clock)) return { id: 1, mem_free: 5_000 };
            return { id: 1, mem_free: Math.round(MEMORY.total - this.used()) };
          default:
            return null;
        }
      },
      call: (method: string, params: Record<string, unknown>, callback: Callback) => {
        if (method === 'KVS.Get') {
          const value = this.kvs[String(params.key)];
          if (value === undefined) callback(null, -105, 'not found');
          else callback({ value, etag: 'e' }, 0, '');
          return;
        }
        if (method === 'EM1Data.GetData') {
          this.logReads++;
          const answer = this.logData(Number(params.ts), Number(params.end_ts));
          this.use(this.used() + 2 * JSON.stringify(answer).length);
          this.pending = Promise.resolve().then(() => callback(answer, 0, ''));
          return;
        }
        if (method !== 'HTTP.Request') throw new Error(`unexpected ${method}`);
        const request = params as unknown as Request;
        const get = request.method === 'GET';
        (get ? this.gets : this.requests).push(request);
        this.use(this.used() + SEND.overhead + SEND.perBodyByte * (request.body ?? '').length);
        this.pending = this.online
          ? Promise.resolve(
              this.app.request(
                request.url,
                get
                  ? { headers: request.headers }
                  : { method: 'POST', headers: request.headers, body: request.body },
              ),
            ).then(async (response) =>
              callback({ code: response.status, body: await response.text() }, 0, ''),
            )
          : Promise.resolve().then(() => callback(null, -1, 'offline'));
      },
    };
    this.context = createContext({
      Shelly: shelly,
      Timer: {
        set: (period: number, repeat: boolean, callback: () => void) => {
          expect([period, repeat]).toEqual([1000, true]);
          this.tick = callback;
          return 1;
        },
      },
      print: (...parts: unknown[]) => this.logs.push(parts.join(' ')),
    });
    runInContext(this.source, this.context);
  }

  /** Memory in use now, from what the script holds in its queue. */
  private used(): number {
    const queued = this.context ? (runInContext(QUEUED_BYTES, this.context) as number) : 0;
    return MEMORY.base + queued;
  }

  /** Over the limit the device stops the script ("out_of_memory"). */
  private use(bytes: number) {
    this.memPeak = Math.max(this.memPeak, bytes);
    if (bytes > MEMORY.total) {
      this.outOfMemory = true;
      this.tick = null;
    }
  }

  /** The script stops (a reboot, until run() again); the device keeps measuring and logging. */
  stop() {
    this.tick = null;
  }

  /** A GetData answer: the records from `ts` to `endTs`, one page at a time. */
  private logData(ts: number, endTs: number) {
    const times = [...this.log.keys()].filter((t) => t >= ts && t <= endTs).sort((a, b) => a - b);
    const page = times.slice(0, LOG_PAGE);
    const data: { ts: number; period: number; values: number[][] }[] = [];
    for (const t of page) {
      const last = data.at(-1);
      if (last && last.ts + 60 * last.values.length === t) last.values.push(this.log.get(t) ?? []);
      else data.push({ ts: t, period: 60, values: [this.log.get(t) ?? []] });
    }
    const next = times[LOG_PAGE];
    return { keys: LOG_KEYS, data, ...(next !== undefined ? { next_record_ts: next } : {}) };
  }

  /** Closes the minute into the log, as the device does. */
  private logMinute() {
    const minute = this.minute;
    if (!minute) return;
    const max = Math.max(...minute.powers);
    const min = Math.min(...minute.powers);
    const mean = minute.powers.reduce((sum, p) => sum + p, 0) / minute.powers.length;
    this.log.set(minute.t, [
      minute.wh,
      0,
      0,
      0,
      max,
      min,
      max / 0.9,
      min / 0.9,
      VOLTAGE,
      VOLTAGE,
      VOLTAGE,
      max / 0.9 / VOLTAGE,
      min / 0.9 / VOLTAGE,
      mean / 0.9 / VOLTAGE,
    ]);
  }

  /** Lets `seconds` pass, one timer tick per second (energy follows the power). */
  async advance(seconds: number) {
    for (let i = 0; i < seconds; i++) {
      if (this.clock % 60 === 0) {
        this.atMinute = this.counter;
        this.logMinute();
        this.minute = { t: this.clock, wh: 0, powers: [] };
      }
      if (this.clock % 60 === 2) this.reported = this.atMinute;
      this.tick?.();
      if (this.context) this.use(this.used());
      await this.pending;
      const power = this.power(this.clock) + 0.4;
      this.counter += power / 3600;
      if (this.minute) {
        this.minute.wh += power / 3600;
        this.minute.powers.push(power);
      }
      this.clock += 1;
    }
  }
}

let db: DatabaseSync;
let shelly: FakeShelly;
let firstCounter: number;

beforeEach(async () => {
  const memory = memorySql();
  db = memory.db;
  const app = createApp({
    sql: memory.sql,
    sessionSecret: 's'.repeat(32),
    allowedOrigins: [],
    now: () => shelly.clock,
  });
  const home = await createHousehold(memory.sql, 'Casa', START);
  await createDevice(
    memory.sql,
    { householdId: home.id, name: 'Quadro', tokenHash: await hashDeviceToken(TOKEN) },
    START,
  );
  shelly = new FakeShelly(app);
  firstCounter = shelly.counter;
});

const minutes = () =>
  db.prepare('SELECT * FROM readings_1m ORDER BY ts').all() as Record<string, number>[];

describe('shelly/wattometro.js', () => {
  it('sends each finished minute with its per-second values', async () => {
    shelly.run();
    await shelly.advance(10 + 3 * 60 + 10);

    const rows = minutes();
    // The partial first minute (10 s) and three whole ones.
    expect(rows.map((row) => row.samples)).toEqual([10, 60, 60, 60]);
    const whole = rows[1];
    expect(whole).toMatchObject({
      channel: 0,
      power_min_w: 400,
      power_max_w: 459,
      power_avg_w: 430,
      voltage_min_dv: 2312,
      voltage_max_dv: 2312,
      pf_avg_pct: 90,
    });
    const blob = db.prepare('SELECT data FROM readings_1s WHERE ts = ?').get(whole?.ts ?? 0) as {
      data: Uint8Array;
    };
    const seconds = decodeSeconds(new Uint8Array(blob.data));
    expect(seconds.power[0]).toBe(400);
    expect(seconds.power[59]).toBe(459);
    // sqrt(S² − P²) with S = P / 0.9, from the decimal values: 400.4 W → 193.9 var.
    expect(seconds.nonActive[0]).toBe(194);
    expect(seconds.voltage.every((v) => v === 2312)).toBe(true);

    const device = db.prepare('SELECT model, firmware, script_version FROM devices').get();
    expect(device).toEqual({ model: 'S3EM-002CXCEU', firmware: '1.4.4', script_version: '0.4.0' });
    expect(shelly.requests[0]?.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    // The boot time goes in every request; with no earlier minute it is not an outage.
    expect(shelly.requests.every((r) => (JSON.parse(r.body) as { b: number }).b === BOOT)).toBe(
      true,
    );
    expect(db.prepare('SELECT boot_at, start_at FROM outages').all()).toEqual([
      { boot_at: BOOT, start_at: null },
    ]);
  });

  it('adds whole Wh per minute that sum exactly to the counter', async () => {
    shelly.run();
    await shelly.advance(10 + 20 * 60 + 10);
    const rows = minutes();
    const total = rows.reduce((sum, row) => sum + (row.energy_wh ?? 0), 0);
    // Energy up to the last closed minute, 10 + 20 × 60 s after the start.
    let counter = firstCounter;
    for (let t = START; t < START + 10 + 20 * 60; t++) counter += (shelly.power(t) + 0.4) / 3600;
    expect(total).toBe(Math.floor(counter) - Math.floor(firstCounter));
    expect(rows.every((row) => Number.isInteger(row.energy_wh))).toBe(true);
  });

  it('gives each minute its own energy, though the counter moves after the minute', async () => {
    // Off for one whole minute, then 6000 W (100 Wh) for the next.
    const off = START + 10;
    shelly.power = (second) => (second >= off + 60 && second < off + 120 ? 6000 : 0);
    shelly.run();
    await shelly.advance(10 + 3 * 60 + 10);
    const energy = (ts: number) => minutes().find((row) => row.ts === ts)?.energy_wh;
    expect(energy(off)).toBe(0);
    expect(energy(off + 60)).toBe(100);
    expect(energy(off + 120)).toBe(0);
  });

  it('recovers a 20-minute outage with every minute, within the memory', async () => {
    shelly.run();
    await shelly.advance(10 + 60 + 10);
    shelly.online = false;
    await shelly.advance(20 * 60);
    expect(minutes()).toHaveLength(2);
    shelly.online = true;
    await shelly.advance(10 * 60);

    expect(shelly.outOfMemory).toBe(false);
    const rows = minutes();
    expect(rows.length).toBe(2 + 20 + 10);
    for (let i = 1; i < rows.length; i++) {
      expect((rows[i]?.ts ?? 0) - (rows[i - 1]?.ts ?? 0)).toBe(60);
    }
    // The per-second values of the oldest offline minutes made room for the rest.
    const withSeconds = db.prepare('SELECT COUNT(*) AS n FROM readings_1s').get() as { n: number };
    expect(withSeconds.n).toBeLessThan(rows.length);
    expect(withSeconds.n).toBeGreaterThan(10);
    for (const request of shelly.requests) expect(request.body.length).toBeLessThanOrEqual(2200);
  });

  it('a brief dip in free memory delays the catch-up but loses no minute', async () => {
    shelly.run();
    await shelly.advance(10 + 60 + 10);
    shelly.online = false;
    await shelly.advance(5 * 60);
    shelly.online = true;
    // Low for 200 s, long enough for a retry to meet it, except when minutes
    // settle (second 5), where a low reading rightly trims the queue.
    const from = shelly.clock;
    shelly.dip = (clock) => clock < from + 200 && clock % 60 !== 5;
    await shelly.advance(8 * 60);
    const rows = minutes();
    expect(rows.map((row) => row.ts)).toEqual(rows.map((_, i) => START + 10 - 60 + 60 * i));
    expect(rows.length).toBe(2 + 5 + 8);
  });

  it('a 3-hour outage keeps the latest minutes, in a row, and never runs out of memory', async () => {
    shelly.run();
    await shelly.advance(10 + 60 + 10);
    shelly.online = false;
    await shelly.advance(3 * 3600);
    shelly.online = true;
    await shelly.advance(15 * 60);

    expect(shelly.outOfMemory).toBe(false);
    expect(shelly.memPeak).toBeLessThan(MEMORY.total);
    const rows = minutes();
    const last = rows.at(-1)?.ts ?? 0;
    // From the first minute kept after the outage on, nothing is missing.
    const kept = rows.filter((row) => (row.ts ?? 0) > START + 3600);
    expect(kept.length).toBeGreaterThan(30);
    expect(kept.map((row) => row.ts)).toEqual(
      kept.map((_, i) => last - 60 * (kept.length - 1 - i)),
    );
  });

  it('reads the answers as the real device gives them (fixtures/shelly)', async () => {
    const fixture = (name: string) =>
      JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', 'shelly', name), 'utf8')) as Record<
        string,
        unknown
      >;
    shelly.em1 = fixture('em1-status.json');
    shelly.run();
    await shelly.advance(10 + 60 + 10);
    // 402.7 W at 228.4 V; non-active power sqrt(483.3² − 402.7²) = 267.2 var; PF ΣP/ΣS = 0.83.
    expect(minutes()[1]).toMatchObject({
      power_avg_w: 403,
      power_min_w: 403,
      power_max_w: 403,
      voltage_avg_dv: 2284,
      pf_avg_pct: 83,
    });
  });

  it('records nothing before the clock is synchronised', async () => {
    shelly.timeSynced = false;
    shelly.run();
    await shelly.advance(3 * 60);
    expect(shelly.requests).toHaveLength(0);
    shelly.timeSynced = true;
    await shelly.advance(2 * 60);
    expect(minutes().length).toBeGreaterThan(0);
  });

  it('waits for configuration and says what is missing', async () => {
    shelly.kvs = {};
    shelly.run();
    await shelly.advance(3 * 60);
    expect(shelly.requests).toHaveLength(0);
    expect(shelly.logs.join('\n')).toContain('wattometro.token');
  });

  it('after a reboot that emptied KVS, sends with the URL and token embedded at install', async () => {
    shelly.kvs = {};
    shelly.source = embedConfig(SOURCE, { url: URL, token: TOKEN });
    shelly.run();
    await shelly.advance(10 + 60 + 10);
    expect(minutes().length).toBeGreaterThan(0);
    expect(shelly.requests[0]?.headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('follows the server clock while its own runs an hour ahead, and its own once it is right', async () => {
    shelly.run();
    await shelly.advance(10 + 5 * 60);
    const skewFrom = shelly.clock;
    shelly.skew = 3600;
    await shelly.advance(60 * 60);
    const skewTo = shelly.clock;
    shelly.skew = 0;
    await shelly.advance(10 * 60);

    const rows = minutes();
    // Every minute stored at its real time, none from the future.
    expect(rows.every((row) => (row.ts ?? 0) < shelly.clock)).toBe(true);
    const during = rows.filter((row) => (row.ts ?? 0) >= skewFrom && (row.ts ?? 0) < skewTo);
    // The first answer after the jump sets the offset: at most the minute open then is lost.
    expect(during.length).toBeGreaterThanOrEqual(59);
    const after = rows.filter((row) => (row.ts ?? 0) >= skewTo);
    expect(after.length).toBeGreaterThanOrEqual(8);
    const logs = shelly.logs.join('\n');
    expect(logs).toContain('clock offset -3600 s');
  });

  describe('fills the gaps from the device log', () => {
    const inARow = (rows: Record<string, number>[]) =>
      rows.every((row, i) => i === 0 || (row.ts ?? 0) - (rows[i - 1]?.ts ?? 0) === 60);

    it('after a 3-hour outage, every minute is back and the Wh still add up', async () => {
      shelly.run();
      await shelly.advance(10 + 60 + 10);
      shelly.online = false;
      await shelly.advance(3 * 3600);
      shelly.online = true;
      await shelly.advance(40 * 60);

      expect(shelly.outOfMemory).toBe(false);
      const rows = minutes();
      expect(inARow(rows)).toBe(true);
      expect(rows.length).toBeGreaterThan(3 * 60 + 40);
      // Minutes from the log come without their per-second values.
      const withSeconds = db.prepare('SELECT COUNT(*) AS n FROM readings_1s').get() as {
        n: number;
      };
      expect(withSeconds.n).toBeLessThan(rows.length - 100);
      // The carried decimals: within a Wh or two of the counter, over ~3 h 40 min.
      const sum = rows.reduce((total, row) => total + (row.energy_wh ?? 0), 0);
      const expected = Math.floor(shelly.counter) - Math.floor(firstCounter);
      expect(Math.abs(sum - expected)).toBeLessThanOrEqual(3);
      expect(shelly.logs.join(' ')).toContain('filling');
    });

    it('after the script was stopped for half an hour, fills that half hour', async () => {
      shelly.run();
      await shelly.advance(10 + 5 * 60);
      shelly.stop();
      await shelly.advance(30 * 60);
      shelly.run();
      await shelly.advance(5 * 60);

      const rows = minutes();
      expect(inARow(rows)).toBe(true);
      expect(rows.length).toBe(1 + 5 + 30 + 4);
    });

    it('with nothing missing, asks once an hour from where it last checked', async () => {
      shelly.run();
      await shelly.advance(10 + 3 * 3600);

      const from = shelly.gets.map((get) =>
        Number(new globalThis.URL(get.url).searchParams.get('from')),
      );
      // The first ask after the boot, then one an hour.
      expect(from.length).toBeGreaterThanOrEqual(3);
      expect(from.length).toBeLessThanOrEqual(4);
      // The first looks back 10 days; later ones start where the previous ended.
      expect(from[0]).toBeLessThan(START - 9 * 86_400);
      expect(from.slice(1).every((ts) => ts > START - 3600)).toBe(true);
      // The minutes before the script started are in no log here: one read finds none.
      expect(shelly.logReads).toBe(1);
      expect(minutes().every((row) => row.ts !== undefined)).toBe(true);
    });
  });
});
