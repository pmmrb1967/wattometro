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
import { runInNewContext } from 'node:vm';
import { beforeEach, describe, expect, it } from 'vitest';
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
const BOOT = START - 3600;

type Callback = (result: unknown, errorCode: number, errorMessage: string) => void;

interface Request {
  url: string;
  body: string;
  headers: Record<string, string>;
}

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
  online = true;
  /** Next readings of free script memory; plenty once they run out. */
  memFree: number[] = [];
  timeSynced = true;
  kvs: Record<string, string> = { 'wattometro.url': URL, 'wattometro.token': TOKEN };
  requests: Request[] = [];
  logs: string[] = [];
  private tick: (() => void) | null = null;
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
              unixtime: this.timeSynced ? this.clock : null,
              uptime: this.clock - BOOT + 0.4,
            };
          case 'em1': {
            const p = this.power(this.clock);
            return { id: 0, voltage: 231.24, act_power: p + 0.4, aprt_power: (p + 0.4) / 0.9 };
          }
          case 'em1data':
            return { id: 0, total_act_energy: this.reported };
          case 'script':
            return { id: 1, mem_free: this.memFree.shift() ?? 20_000 };
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
        if (method !== 'HTTP.Request') throw new Error(`unexpected ${method}`);
        const request = params as unknown as Request;
        this.requests.push(request);
        this.pending = this.online
          ? Promise.resolve(
              this.app.request(request.url, {
                method: 'POST',
                headers: request.headers,
                body: request.body,
              }),
            ).then(async (response) =>
              callback({ code: response.status, body: await response.text() }, 0, ''),
            )
          : Promise.resolve().then(() => callback(null, -1, 'offline'));
      },
    };
    runInNewContext(SOURCE, {
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
  }

  /** Lets `seconds` pass, one timer tick per second (energy follows the power). */
  async advance(seconds: number) {
    for (let i = 0; i < seconds; i++) {
      if (this.clock % 60 === 0) this.atMinute = this.counter;
      if (this.clock % 60 === 2) this.reported = this.atMinute;
      this.tick?.();
      await this.pending;
      this.counter += (this.power(this.clock) + 0.4) / 3600;
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
    expect(device).toEqual({ model: 'S3EM-002CXCEU', firmware: '1.4.4', script_version: '0.2.1' });
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

  it('recovers 30 minutes without internet with no gaps, in requests under the Shelly limit', async () => {
    shelly.run();
    await shelly.advance(10 + 60 + 10);
    shelly.online = false;
    await shelly.advance(30 * 60);
    expect(minutes()).toHaveLength(2);
    shelly.online = true;
    await shelly.advance(5 * 60);

    const rows = minutes();
    expect(rows.length).toBe(2 + 30 + 5);
    for (let i = 1; i < rows.length; i++) {
      expect((rows[i]?.ts ?? 0) - (rows[i - 1]?.ts ?? 0)).toBe(60);
    }
    expect(db.prepare('SELECT COUNT(*) AS n FROM readings_1s').get()).toEqual({ n: rows.length });
    for (const request of shelly.requests) {
      expect(request.body.length).toBeLessThanOrEqual(7000);
      expect(request.url.length + request.body.length + TOKEN.length + 100).toBeLessThan(8192);
    }
  });

  it('drops the per-second values first when memory runs low, keeping the minutes', async () => {
    shelly.run();
    shelly.online = false;
    await shelly.advance(10 + 10 * 60);
    // Low at the next check and after each of the next 4 trims: 5 minutes lose their seconds.
    shelly.memFree = [1000, 1000, 1000, 1000, 1000];
    await shelly.advance(60);
    shelly.online = true;
    // Long enough for the retry back-off (at most 5 min) and the catch-up.
    await shelly.advance(6 * 60);

    const rows = minutes();
    expect(rows).toHaveLength(17);
    const withSeconds = db.prepare('SELECT ts FROM readings_1s ORDER BY ts').all() as {
      ts: number;
    }[];
    // The oldest five went without their per-second values.
    expect(withSeconds.map((row) => row.ts)).toEqual(rows.slice(5).map((row) => row.ts));
  });

  it('drops the oldest minutes when trimming the seconds is not enough', async () => {
    shelly.run();
    shelly.online = false;
    await shelly.advance(10 + 4 * 60);
    // Queue of 5: 4 trims of seconds, then 4 oldest minutes dropped; every check reads low.
    shelly.memFree = Array.from({ length: 9 }, () => 1000);
    await shelly.advance(60);
    shelly.online = true;
    await shelly.advance(6 * 60);
    const rows = minutes();
    // The partial first minute and the next three are gone; from the fifth on nothing is missing.
    const firstKept = START + 10 + 4 * 60 - 60;
    expect(rows[0]?.ts).toBe(firstKept);
    expect(rows.map((row) => row.ts)).toEqual(rows.map((_, i) => firstKept + 60 * i));
    expect(rows.length).toBe(1 + 6);
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
});
