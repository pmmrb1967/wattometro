// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'vitest';
import { decodeSeconds, encodeSeconds, READINGS_1S_BYTES } from '../../src/lib/readings-1s';
import { memorySql } from '../test/sqlite';
import { createApp } from './app';
import type { Sql } from './db';
import { hashPassword } from './password';
import { createDevice } from './repo/devices';
import { createHousehold } from './repo/households';
import { PEAK_RECORD_BYTES, splitRange } from './repo/power';
import { runMaintenance } from './rollups';
import { startOfLisbonDay } from '../../src/lib/time';
import { SECONDS_RECORD_BYTES } from './repo/seconds';
import { minuteStatements } from './repo/readings';
import { createUser } from './repo/users';

const ORIGIN = 'https://app.example';
const PASSWORD = 'uma password comprida';
const START = Date.parse('2026-07-15T09:00:00Z') / 1000;
const NOW = START + 86_400;

let app: ReturnType<typeof createApp>;
let sql: Sql;
const households: { id: string; deviceId: string }[] = [];

beforeEach(async () => {
  sql = memorySql().sql;
  households.length = 0;
  app = createApp({ sql, sessionSecret: 's'.repeat(32), allowedOrigins: [], now: () => NOW });
  for (const [email, home] of [
    ['ana@example.pt', 'Casa'],
    ['rui@example.pt', 'Outra'],
  ] as const) {
    const id = (await createHousehold(sql, home, 0)).id;
    const passwordHash = await hashPassword(PASSWORD, 1000);
    await createUser(sql, { householdId: id, email, passwordHash }, 0);
    const tokenHash = email.padEnd(64, 'x');
    const device = await createDevice(sql, { householdId: id, name: 'Quadro', tokenHash }, 0);
    households.push({ id, deviceId: device.id });
  }
});

async function signIn() {
  const response = await app.request(`${ORIGIN}/v1/auth/login`, {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'ana@example.pt', password: PASSWORD }),
  });
  const value = /__Host-wm_session=([^;]+)/.exec(response.headers.get('Set-Cookie') ?? '')?.[1];
  return `__Host-wm_session=${value}`;
}

const get = (cookie: string, path: string) =>
  app.request(`${ORIGIN}${path}`, { headers: { Cookie: cookie } });

/** A minute peaking at `activeW`; with per-second values its apparent peak is `apparentVa`. */
async function minute(index: number, ts: number, activeW: number, apparentVa: number | null) {
  const household = households[index]!;
  const seconds =
    apparentVa === null
      ? null
      : encodeSeconds({
          power: Array.from({ length: 60 }, () => activeW),
          nonActive: Array.from({ length: 60 }, () =>
            Math.round(Math.sqrt(apparentVa ** 2 - activeW ** 2)),
          ),
          voltage: Array.from({ length: 60 }, () => 2300),
        });
  await sql.batch(
    minuteStatements(
      { id: household.deviceId, householdId: household.id },
      {
        ts,
        channel: 0,
        samples: 60,
        energyWh: 1,
        powerAvgW: activeW,
        powerMinW: activeW,
        powerMaxW: activeW,
        voltageMinDv: 2300,
        voltageAvgDv: 2300,
        voltageMaxDv: 2300,
        pfAvgPct: 95,
        apparentMaxVa: apparentVa,
        seconds,
      },
    ),
  );
}

describe('GET /v1/power', () => {
  it('gives the peaks per meter and the highest quarter hours', async () => {
    await minute(0, START, 3000, 3200);
    await minute(0, START + 60, 5000, null);
    await minute(0, START + 960, 6000, 6500);
    await minute(1, START, 9000, 9900);
    const cookie = await signIn();
    const response = await get(cookie, `/v1/power?from=${START}&to=${NOW}`);
    expect(response.status).toBe(200);
    const { deviceId } = households[0]!;
    expect(await response.json()).toEqual({
      devices: [{ id: deviceId, name: 'Quadro' }],
      meters: [
        {
          meter: `${deviceId}:0`,
          minutes: 3,
          apparentMinutes: 2,
          apparentMaxVa: 6500,
          activeMaxW: 6000,
          activeOnlyMaxW: 5000,
          top: [
            { ts: START + 900, peak: 6500, estimated: false },
            { ts: START, peak: 5000, estimated: true },
          ],
        },
      ],
      eredes: { quarters: 0, maxEnergyWh: null },
    });
  });
});

describe('the rolled-up stretch', () => {
  it('splits a range into minutes, quarter hours and whole Lisbon days', () => {
    const from = startOfLisbonDay('2026-07-10') + 130; // 00:02:10 on 10/7
    const until = startOfLisbonDay('2026-07-14') + 3600 + 400; // 01:06:40 on 14/7
    const to = until + 300;
    expect(splitRange(from, to, until)).toEqual({
      head: [from, from + 770],
      quarters: [from + 770, startOfLisbonDay('2026-07-14') + 3600],
      edges: [
        [from + 770, startOfLisbonDay('2026-07-11')],
        [startOfLisbonDay('2026-07-14'), startOfLisbonDay('2026-07-14') + 3600],
      ],
      days: ['2026-07-11', '2026-07-14'],
      tail: [startOfLisbonDay('2026-07-14') + 3600, to],
    });
    // Before any roll-up: everything from the minutes.
    expect(splitRange(from, to, null).tail).toEqual([from + 770, to]);
  });

  it("gives the same peaks from the Cron's aggregates as from the minutes", async () => {
    // Four days back, across midnights, with and without per-second values.
    const day = 86_400;
    await minute(0, START - 3 * day, 7000, 7700);
    await minute(0, START - 3 * day + 60, 7500, null);
    await minute(0, START - 2 * day + 1800, 3000, 3200);
    await minute(0, START - day + 7260, 8000, null);
    await minute(0, START, 3000, 3200);
    await minute(0, START + 960, 6000, 6500);
    await minute(0, NOW - 120, 4000, 4100);
    const cookie = await signIn();
    const from = START - 4 * day + 100;
    const meter = `${households[0]!.deviceId}:0`;
    const read = async () => ({
      power: await (await get(cookie, `/v1/power?from=${from}&to=${NOW}`)).json(),
      peaks: new Uint8Array(
        await (
          await get(cookie, `/v1/power/peaks?meter=${meter}&from=${from}&to=${NOW}&threshold=5000`)
        ).arrayBuffer(),
      ),
    });
    const fromMinutes = await read();
    expect(fromMinutes.power.meters[0].minutes).toBe(7);
    expect(fromMinutes.peaks.byteLength).toBe(4 * PEAK_RECORD_BYTES);
    await runMaintenance(sql, NOW);
    expect(await read()).toEqual(fromMinutes);
  });
});

describe('GET /v1/seconds', () => {
  it('packs the per-second values of the meter, in its household only', async () => {
    await minute(0, START, 3000, 3200);
    await minute(0, START + 60, 5000, null);
    await minute(0, START + 120, 6000, 6500);
    await minute(1, START + 60, 9000, 9900);
    const cookie = await signIn();
    const meter = `${households[0]!.deviceId}:0`;
    const response = await get(cookie, `/v1/seconds?meter=${meter}&from=${START}&to=${NOW}`);
    expect(response.status).toBe(200);
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(bytes.byteLength).toBe(2 * SECONDS_RECORD_BYTES);
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(0, true)).toBe(START);
    expect(view.getUint32(SECONDS_RECORD_BYTES, true)).toBe(START + 120);
    expect(decodeSeconds(bytes.slice(4, SECONDS_RECORD_BYTES)).power[59]).toBe(3000);

    const other = `${households[1]!.deviceId}:0`;
    const theirs = await get(cookie, `/v1/seconds?meter=${other}&from=${START}&to=${NOW}`);
    expect((await theirs.arrayBuffer()).byteLength).toBe(0);
  });

  it('refuses more than a day of 25 hours', async () => {
    const cookie = await signIn();
    const meter = `${households[0]!.deviceId}:0`;
    const path = `/v1/seconds?meter=${meter}&from=${START}&to=${START + 25 * 3600 + 1}`;
    expect((await get(cookie, path)).status).toBe(400);
  });
});

describe('GET /v1/power/peaks', () => {
  it('packs the minutes above the threshold, with their per-second values', async () => {
    await minute(0, START, 3000, 3200);
    await minute(0, START + 60, 5000, null);
    await minute(0, START + 120, 6000, 6500);
    await minute(1, START + 60, 9000, 9900);
    const cookie = await signIn();
    const meter = `${households[0]!.deviceId}:0`;
    const response = await get(
      cookie,
      `/v1/power/peaks?meter=${meter}&from=${START}&to=${NOW}&threshold=4000`,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('X-Truncated')).toBe('0');
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(bytes.byteLength).toBe(2 * PEAK_RECORD_BYTES);
    const view = new DataView(bytes.buffer);
    expect([view.getUint32(0, true), view.getInt32(4, true), view.getInt32(8, true)]).toEqual([
      START + 60,
      5000,
      -1,
    ]);
    expect(view.getUint8(12)).toBe(0);
    const second = PEAK_RECORD_BYTES;
    expect(view.getInt32(second + 8, true)).toBe(6500);
    expect(view.getUint8(second + 12)).toBe(1);
    const seconds = decodeSeconds(bytes.slice(second + 13, second + 13 + READINGS_1S_BYTES));
    expect(seconds.power[0]).toBe(6000);
  });

  it('refuses a bad meter', async () => {
    const cookie = await signIn();
    const path = `/v1/power/peaks?meter=x&from=${START}&to=${NOW}&threshold=1`;
    expect((await get(cookie, path)).status).toBe(400);
  });
});
