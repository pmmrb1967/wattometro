// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'vitest';
import { encodeSeconds } from '../../src/lib/readings-1s';
import { MAX_EQUIPMENT, type EquipmentInput } from '../../src/domain/equipment';
import { memorySql } from '../test/sqlite';
import { createApp } from './app';
import type { Sql } from './db';
import { hashPassword } from './password';
import { createDevice } from './repo/devices';
import { createHousehold } from './repo/households';
import { minuteStatements } from './repo/readings';
import { createUser } from './repo/users';

const ORIGIN = 'https://app.example';
const PASSWORD = 'uma password comprida';
const START = Date.parse('2026-11-02T09:00:00Z') / 1000;
const NOW = START + 3 * 3600;

let app: ReturnType<typeof createApp>;
let sql: Sql;
const households: { id: string; deviceId: string; email: string }[] = [];

beforeEach(async () => {
  sql = memorySql().sql;
  households.length = 0;
  app = createApp({ sql, sessionSecret: 's'.repeat(32), allowedOrigins: [], now: () => NOW });
  for (const email of ['ana@example.pt', 'rui@example.pt']) {
    const id = (await createHousehold(sql, email, 0)).id;
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

const equipment = (name: string, extra: Partial<EquipmentInput> = {}): EquipmentInput => ({
  name,
  kind: null,
  brand: null,
  model: null,
  room: null,
  ratedPowerW: null,
  energyClass: null,
  notes: null,
  programmes: [],
  estimate: null,
  ...extra,
});

const WASHER = equipment('Máquina da roupa', {
  kind: 'washer',
  brand: 'LG',
  room: 'Lavandaria',
  ratedPowerW: 2100,
  programmes: [{ name: 'Mix', durationS: 4860, energyWh: 458, temperatureC: 35, loadKg: 4 }],
});

const descriptor = (label: string, powerW: number) => ({
  label,
  powerW,
  statesW: [powerW],
  pulsing: false,
  minDurationS: null,
  maxDurationS: null,
  heats: null,
});

interface Item {
  id: string;
  name: string;
  estimate?: unknown;
}
interface ApplianceRow {
  id: string;
  label: string;
  equipmentId: string | null;
}

const listEquipment = async (cookie: string) =>
  ((await (await request(cookie, 'GET', '/v1/equipment')).json()) as { items: Item[] }).items;

const listAppliances = async (cookie: string) =>
  (
    (await (await request(cookie, 'GET', '/v1/appliances')).json()) as {
      appliances: ApplianceRow[];
    }
  ).appliances;

const labels = async (cookie: string) =>
  (
    (await (await request(cookie, 'GET', '/v1/signatures')).json()) as {
      signatures: { label: string }[];
    }
  ).signatures.map((signature) => signature.label);

async function create(cookie: string, input: EquipmentInput): Promise<string> {
  const response = await request(cookie, 'POST', '/v1/equipment', input);
  expect(response.status).toBe(201);
  return ((await response.json()) as { item: Item }).item.id;
}

async function appliance(cookie: string, label: string, powerW: number): Promise<ApplianceRow> {
  const response = await request(cookie, 'POST', '/v1/appliances', descriptor(label, powerW));
  expect(response.status).toBe(201);
  return ((await response.json()) as { appliance: ApplianceRow }).appliance;
}

/** A calibration named `label` over two minutes of the first household's meter. */
async function calibration(cookie: string, label: string, minute: number) {
  const household = households[0]!;
  const from = START + minute * 60;
  for (let ts = from; ts < from + 180; ts += 60) {
    await sql.batch(
      minuteStatements(
        { id: household.deviceId, householdId: household.id },
        {
          ts,
          channel: 0,
          samples: 60,
          energyWh: 10,
          powerAvgW: 600,
          powerMinW: 600,
          powerMaxW: 600,
          voltageMinDv: 2300,
          voltageAvgDv: 2300,
          voltageMaxDv: 2300,
          pfAvgPct: 95,
          apparentMaxVa: 600,
          seconds: encodeSeconds({
            power: Array.from({ length: 60 }, () => 600),
            nonActive: Array.from({ length: 60 }, () => 0),
            voltage: Array.from({ length: 60 }, () => 2300),
          }),
        },
      ),
    );
  }
  const response = await request(cookie, 'POST', '/v1/signatures', {
    meter: `${household.deviceId}:0`,
    label,
    from: from + 60,
    to: from + 120,
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { signature: { id: string } }).signature.id;
}

describe('/v1/equipment', () => {
  it('adds, lists, changes and removes, per household', async () => {
    const ana = await signIn(0);
    const rui = await signIn(1);
    const created = await request(ana, 'POST', '/v1/equipment', WASHER);
    expect(created.status).toBe(201);
    const { item } = (await created.json()) as { item: Item };
    expect(item).toEqual({ ...WASHER, id: item.id, createdAt: NOW });
    expect(await listEquipment(ana)).toEqual([item]);
    expect(await listEquipment(rui)).toEqual([]);

    const changed = { ...WASHER, room: 'Cozinha' };
    expect((await request(rui, 'PUT', `/v1/equipment/${item.id}`, changed)).status).toBe(404);
    expect((await request(ana, 'PUT', `/v1/equipment/${item.id}`, changed)).status).toBe(204);
    expect(await listEquipment(ana)).toEqual([{ ...changed, id: item.id, createdAt: NOW }]);

    await request(rui, 'DELETE', `/v1/equipment/${item.id}`);
    expect(await listEquipment(ana)).toHaveLength(1);
    expect((await request(ana, 'DELETE', `/v1/equipment/${item.id}`)).status).toBe(204);
    expect(await listEquipment(ana)).toEqual([]);
  });

  it('keeps the estimate of an equipment (migration 0028), also through an older client', async () => {
    const ana = await signIn(0);
    const estimate = { basis: 'cycles100' as const, labelWh: 58_000, cyclesPerWeek: 4 };
    const created = await request(ana, 'POST', '/v1/equipment', { ...WASHER, estimate });
    expect(created.status).toBe(201);
    const { item } = (await created.json()) as { item: Item };
    const older = Object.fromEntries(Object.entries(WASHER).filter(([key]) => key !== 'estimate'));
    // An app from before 0028 sends no estimate: what is stored stays.
    expect((await request(ana, 'PUT', `/v1/equipment/${item.id}`, older)).status).toBe(204);
    expect((await listEquipment(ana))[0]?.estimate).toEqual(estimate);
    await request(ana, 'PUT', `/v1/equipment/${item.id}`, { ...WASHER, estimate: null });
    expect((await listEquipment(ana))[0]?.estimate).toBeNull();
    const plate = { basis: 'plate' as const, minutesPerDay: 30 };
    await request(ana, 'PUT', `/v1/equipment/${item.id}`, { ...WASHER, estimate: plate });
    expect((await listEquipment(ana))[0]?.estimate).toEqual(plate);
    const bad = { ...WASHER, estimate: { basis: 'cycles100', labelWh: 58_000 } };
    expect((await request(ana, 'POST', '/v1/equipment', { ...bad, name: 'Outra' })).status).toBe(
      400,
    );
  });

  it('refuses a name the house already has, whatever the case', async () => {
    const ana = await signIn(0);
    const rui = await signIn(1);
    await create(ana, WASHER);
    const again = await request(ana, 'POST', '/v1/equipment', equipment('  máquina da ROUPA '));
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: 'name_taken' });
    // Another house may have one of its own.
    await create(rui, equipment('Máquina da roupa'));

    const kettle = await create(ana, equipment('Chaleira'));
    const taken = await request(
      ana,
      'PUT',
      `/v1/equipment/${kettle}`,
      equipment('MÁQUINA DA ROUPA'),
    );
    expect(taken.status).toBe(409);
    expect((await listEquipment(ana)).map((item) => item.name)).toEqual([
      'Chaleira',
      'Máquina da roupa',
    ]);
    // Its own name, in other letters, is not taken.
    const same = await request(ana, 'PUT', `/v1/equipment/${kettle}`, equipment('CHALEIRA'));
    expect(same.status).toBe(204);
  });

  it(`keeps at most ${MAX_EQUIPMENT} per household`, async () => {
    const ana = await signIn(0);
    for (let index = 0; index < MAX_EQUIPMENT; index += 1) {
      await create(ana, equipment(`Equipamento ${index}`));
    }
    const over = await request(ana, 'POST', '/v1/equipment', equipment('Mais um'));
    expect(over.status).toBe(409);
    expect(await over.json()).toEqual({ error: 'too_many' });
  });

  it('refuses programmes on a kind without them', async () => {
    const ana = await signIn(0);
    const response = await request(ana, 'POST', '/v1/equipment', { ...WASHER, kind: 'oven' });
    expect(response.status).toBe(400);
  });
});

describe('linking appliances', () => {
  it('gives the equipment its name to appliances of other names, and to their calibrations', async () => {
    const ana = await signIn(0);
    const low = await appliance(ana, 'Aquecedor 1R', 621);
    const high = await appliance(ana, 'Aquecedor 2R', 1453);
    const kettle = await appliance(ana, 'Chaleira', 2100);
    await calibration(ana, 'Aquecedor 1R', 0);
    await calibration(ana, 'Chaleira', 10);
    const heater = await create(ana, equipment('Aquecedor', { kind: 'heater' }));

    const rui = await signIn(1);
    const foreign = { labels: ['Aquecedor 1R'] };
    expect((await request(rui, 'POST', `/v1/equipment/${heater}/link`, foreign)).status).toBe(404);
    const linked = await request(ana, 'POST', `/v1/equipment/${heater}/link`, {
      labels: ['aquecedor 1r', 'Aquecedor 2R'],
    });
    expect(linked.status).toBe(204);

    const appliances = await listAppliances(ana);
    expect(appliances.find((item) => item.id === low.id)).toMatchObject({
      label: 'Aquecedor',
      equipmentId: heater,
    });
    expect(appliances.find((item) => item.id === high.id)).toMatchObject({
      label: 'Aquecedor',
      equipmentId: heater,
    });
    expect(appliances.find((item) => item.id === kettle.id)).toMatchObject({
      label: 'Chaleira',
      equipmentId: null,
    });
    expect((await labels(ana)).sort()).toEqual(['Aquecedor', 'Chaleira']);
  });

  it('renames what is linked with the equipment, and unlinks it when the equipment goes', async () => {
    const ana = await signIn(0);
    await appliance(ana, 'Aquecedor 1R', 621);
    await appliance(ana, 'Aquecedor 2R', 1453);
    await calibration(ana, 'Aquecedor 2R', 0);
    const heater = await create(ana, equipment('Aquecedor'));
    await request(ana, 'POST', `/v1/equipment/${heater}/link`, {
      labels: ['Aquecedor 1R', 'Aquecedor 2R'],
    });

    const renamed = await request(
      ana,
      'PUT',
      `/v1/equipment/${heater}`,
      equipment('Aquecedor da sala'),
    );
    expect(renamed.status).toBe(204);
    expect((await listAppliances(ana)).map((item) => item.label)).toEqual([
      'Aquecedor da sala',
      'Aquecedor da sala',
    ]);
    expect(await labels(ana)).toEqual(['Aquecedor da sala']);

    expect((await request(ana, 'DELETE', `/v1/equipment/${heater}`)).status).toBe(204);
    expect(await listAppliances(ana)).toMatchObject([
      { label: 'Aquecedor da sala', equipmentId: null },
      { label: 'Aquecedor da sala', equipmentId: null },
    ]);
  });

  it('links an appliance named after an equipment when it is named', async () => {
    const ana = await signIn(0);
    const heater = await create(ana, equipment('Aquecedor'));
    const named = await appliance(ana, ' aquecedor ', 621);
    expect(named).toMatchObject({ label: 'Aquecedor', equipmentId: heater });
    const other = await appliance(ana, 'Chaleira', 2100);
    expect(other.equipmentId).toBeNull();
  });

  it('keeps the name of a linked appliance and its calibrations for the equipment to change', async () => {
    const ana = await signIn(0);
    const heater = await create(ana, equipment('Aquecedor'));
    const named = await appliance(ana, 'Aquecedor', 621);
    const signature = await calibration(ana, 'Aquecedor', 0);
    const rename = await request(ana, 'PATCH', `/v1/appliances/${named.id}`, { label: 'Outro' });
    expect(rename.status).toBe(409);
    expect(await rename.json()).toEqual({ error: 'linked' });
    const durations = await request(ana, 'PATCH', `/v1/appliances/${named.id}`, {
      durations: { minS: 60, maxS: 600 },
    });
    expect(durations.status).toBe(204);
    const signatureRename = await request(ana, 'PATCH', `/v1/signatures/${signature}`, {
      label: 'Outro',
    });
    expect(signatureRename.status).toBe(409);
    expect(await labels(ana)).toEqual(['Aquecedor']);
    expect(heater).toBeTruthy();
  });

  it('links an unlinked appliance renamed to an equipment', async () => {
    const ana = await signIn(0);
    const heater = await create(ana, equipment('Aquecedor'));
    const named = await appliance(ana, 'Radiador', 621);
    const rename = await request(ana, 'PATCH', `/v1/appliances/${named.id}`, {
      label: 'AQUECEDOR',
    });
    expect(rename.status).toBe(204);
    expect(await listAppliances(ana)).toMatchObject([
      { id: named.id, label: 'Aquecedor', equipmentId: heater },
    ]);
  });

  it('renames calibrations whatever their case when an appliance is linked or the equipment renamed', async () => {
    const ana = await signIn(0);
    const kettle = await create(ana, equipment('Chaleira'));
    const signature = await calibration(ana, 'chaleira', 0);
    await appliance(ana, 'chaleira', 2100);
    expect(await labels(ana)).toEqual(['Chaleira']);
    await request(ana, 'PUT', `/v1/equipment/${kettle}`, equipment('Chaleira elétrica'));
    expect(await labels(ana)).toEqual(['Chaleira elétrica']);
    const rename = await request(ana, 'PATCH', `/v1/signatures/${signature}`, { label: 'Outro' });
    expect(rename.status).toBe(409);
  });

  it('links the appliances of the name an equipment is renamed to', async () => {
    const ana = await signIn(0);
    const oven = await create(ana, equipment('Forno'));
    await appliance(ana, 'Forno', 2000);
    const kettle = await appliance(ana, 'chaleira', 2100);
    await request(ana, 'PUT', `/v1/equipment/${oven}`, equipment('Chaleira'));
    expect((await listAppliances(ana)).find((item) => item.id === kettle.id)).toMatchObject({
      label: 'Chaleira',
      equipmentId: oven,
    });
  });
});
