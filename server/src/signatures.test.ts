// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'vitest';
import { decodeSeconds, encodeSeconds } from '../../src/lib/readings-1s';
import { memorySql } from '../test/sqlite';
import { createApp } from './app';
import type { Sql } from './db';
import { hashPassword } from './password';
import { createDevice } from './repo/devices';
import { createHousehold } from './repo/households';
import { minuteStatements } from './repo/readings';
import { SECONDS_RECORD_BYTES } from './repo/seconds';
import { signatureMinutes } from './repo/signatures';
import { createUser } from './repo/users';

const ORIGIN = 'https://app.example';
const PASSWORD = 'uma password comprida';
const START = Date.parse('2026-07-15T09:00:00Z') / 1000;
const NOW = START + 3 * 3600;

let app: ReturnType<typeof createApp>;
let sql: Sql;
const households: { id: string; deviceId: string; email: string }[] = [];

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
    const device = await createDevice(
      sql,
      { householdId: id, name: 'Quadro', tokenHash: email.padEnd(64, 'x') },
      0,
    );
    households.push({ id, deviceId: device.id, email });
  }
});

async function signIn(index = 0) {
  const response = await app.request(`${ORIGIN}/v1/auth/login`, {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: households[index]!.email, password: PASSWORD }),
  });
  const value = /__Host-wm_session=([^;]+)/.exec(response.headers.get('Set-Cookie') ?? '')?.[1];
  return `__Host-wm_session=${value}`;
}

const request = (cookie: string, method: string, path: string, body?: unknown) =>
  app.request(`${ORIGIN}${path}`, {
    method,
    headers: { Origin: ORIGIN, Cookie: cookie, 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

/** Minutes [from, to) of a household's meter, each at `watts` every second. */
async function minutes(index: number, from: number, to: number, watts: number) {
  const household = households[index]!;
  for (let ts = from; ts < to; ts += 60) {
    await sql.batch(
      minuteStatements(
        { id: household.deviceId, householdId: household.id },
        {
          ts,
          channel: 0,
          samples: 60,
          energyWh: Math.round(watts / 60),
          powerAvgW: watts,
          powerMinW: watts,
          powerMaxW: watts,
          voltageMinDv: 2300,
          voltageAvgDv: 2300,
          voltageMaxDv: 2300,
          pfAvgPct: 95,
          apparentMaxVa: watts,
          seconds: encodeSeconds({
            power: Array.from({ length: 60 }, () => watts),
            nonActive: Array.from({ length: 60 }, () => 0),
            voltage: Array.from({ length: 60 }, () => 2300),
          }),
        },
      ),
    );
  }
}

describe('signatures', () => {
  it('copies the whole minutes marked and one beyond each side', () => {
    expect(signatureMinutes(START + 30, START + 150)).toEqual({
      first: START - 60,
      end: START + 240,
    });
    expect(signatureMinutes(START, START + 120)).toEqual({ first: START - 60, end: START + 180 });
  });

  it('keeps the marked minutes after readings_1s is purged', async () => {
    await minutes(0, START, START + 600, 2000);
    const cookie = await signIn();
    const meter = `${households[0]!.deviceId}:0`;
    const created = await request(cookie, 'POST', '/v1/signatures', {
      meter,
      label: ' Chaleira ',
      from: START + 130,
      to: START + 280,
    });
    expect(created.status).toBe(201);
    const { signature } = (await created.json()) as { signature: { id: string } };
    // 02:10–04:40 → minutes 1 to 5 (one beyond each side).
    expect(signature).toMatchObject({ meter, label: 'Chaleira', from: START + 130, minutes: 5 });

    await sql.run(
      'DELETE FROM readings_1s WHERE household_id = ? AND ts < ?',
      households[0]!.id,
      NOW,
    );
    const list = await request(cookie, 'GET', '/v1/signatures');
    expect(await list.json()).toEqual({
      signatures: [
        {
          id: signature.id,
          meter,
          label: 'Chaleira',
          from: START + 130,
          to: START + 280,
          minutes: 5,
          createdAt: NOW,
        },
      ],
    });
    const seconds = await request(cookie, 'GET', `/v1/signatures/${signature.id}/seconds`);
    const bytes = new Uint8Array(await seconds.arrayBuffer());
    expect(bytes.byteLength).toBe(5 * SECONDS_RECORD_BYTES);
    expect(new DataView(bytes.buffer).getUint32(0, true)).toBe(START + 60);
    expect(decodeSeconds(bytes.slice(4, SECONDS_RECORD_BYTES)).power[0]).toBe(2000);
  });

  it('is only seen, read and deleted by its household', async () => {
    await minutes(0, START, START + 300, 2000);
    const ana = await signIn(0);
    const rui = await signIn(1);
    const created = await request(ana, 'POST', '/v1/signatures', {
      meter: `${households[0]!.deviceId}:0`,
      label: 'Chaleira',
      from: START + 60,
      to: START + 180,
    });
    const { signature } = (await created.json()) as { signature: { id: string } };

    expect(await (await request(rui, 'GET', '/v1/signatures')).json()).toEqual({
      signatures: [],
    });
    expect((await request(rui, 'GET', `/v1/signatures/${signature.id}/seconds`)).status).toBe(404);
    await request(rui, 'DELETE', `/v1/signatures/${signature.id}`);
    expect(
      ((await (await request(ana, 'GET', '/v1/signatures')).json()) as { signatures: unknown[] })
        .signatures,
    ).toHaveLength(1);
    // Nor marked on another household's meter.
    const theirs = await request(rui, 'POST', '/v1/signatures', {
      meter: `${households[0]!.deviceId}:0`,
      label: 'Chaleira',
      from: START + 60,
      to: START + 180,
    });
    expect(theirs.status).toBe(404);

    expect((await request(ana, 'DELETE', `/v1/signatures/${signature.id}`)).status).toBe(204);
    expect(await (await request(ana, 'GET', '/v1/signatures')).json()).toEqual({
      signatures: [],
    });
    const left = await sql.first<{ n: number }>('SELECT COUNT(*) AS n FROM signature_seconds');
    expect(left?.n).toBe(0);
  });

  it('saves nothing before the minutes have arrived', async () => {
    const cookie = await signIn();
    const response = await request(cookie, 'POST', '/v1/signatures', {
      meter: `${households[0]!.deviceId}:0`,
      label: 'Chaleira',
      from: START + 60,
      to: START + 180,
    });
    expect(response.status).toBe(409);
    const left = await sql.first<{ n: number }>('SELECT COUNT(*) AS n FROM signatures');
    expect(left?.n).toBe(0);
  });

  it('refuses a run in the future, longer than 4 hours or without a name', async () => {
    const cookie = await signIn();
    const meter = `${households[0]!.deviceId}:0`;
    for (const body of [
      { meter, label: 'Forno', from: NOW - 60, to: NOW + 60 },
      { meter, label: 'Forno', from: START, to: START + 4 * 3600 + 1 },
      { meter, label: ' ', from: START, to: START + 60 },
      { meter, label: 'Forno', from: START + 60, to: START + 60 },
    ]) {
      expect((await request(cookie, 'POST', '/v1/signatures', body)).status).toBe(400);
    }
  });
});
