// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest';
import {
  emptyLocalData,
  importSummary,
  localDataSchema,
  withQuarters,
  type LocalData,
} from './data';
import { MAX_EQUIPMENT } from '../domain/equipment';
import { createLocalServer } from './server';
import { memoryStore, type LocalStore } from './store';

// 2026-01-15 00:00 in Lisbon (UTC in winter).
const DAY = Date.UTC(2026, 0, 15) / 1000;
const NOW = DAY + 10 * 86_400;

function server(store = memoryStore()) {
  return { store, api: createLocalServer(store, () => NOW) };
}

async function body(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

async function kept(store: LocalStore): Promise<LocalData | null> {
  const read = await store.load();
  return read.kind === 'ok' ? read.data : null;
}

/** A store holding data it cannot read: whatever is written over them is a loss. */
function unreadableStore() {
  const save = vi.fn(() => Promise.resolve(true));
  const store: LocalStore = {
    ...memoryStore(),
    load: () => Promise.resolve({ kind: 'unreadable', raw: { version: 99 } }),
    save,
  };
  return { store, save };
}

describe('withQuarters', () => {
  it('writes a batch over what is kept, in time order', () => {
    expect(
      withQuarters(
        [
          [DAY, 100, 0],
          [DAY + 900, 200, 0],
        ],
        [
          [DAY + 1800, 50, 1],
          [DAY + 900, 210, 0],
        ],
      ),
    ).toEqual([
      [DAY, 100, 0],
      [DAY + 900, 210, 0],
      [DAY + 1800, 50, 1],
    ]);
  });
});

describe('importSummary', () => {
  it('counts the quarters, the estimated ones and the days, as the server', () => {
    expect(
      importSummary([
        [DAY, 100, 0],
        [DAY + 900, 200, 1],
        [DAY + 86_400, 300, 0],
      ]),
    ).toEqual({
      quarters: 3,
      estimated: 1,
      energyWh: 600,
      from: DAY,
      to: DAY + 86_400 + 900,
      days: [
        ['2026-01-15', 2, 1],
        ['2026-01-16', 1, 0],
      ],
    });
  });
});

describe('local server', () => {
  it('keeps an import in the store and answers the energy routes from it', async () => {
    const { store, api } = server();
    const quarters = [
      [DAY, 100, 0],
      [DAY + 900, 200, 0],
      [DAY + 86_400, 300, 1],
    ];
    const written = await api.respond('POST', '/v1/import/eredes', { quarters });
    expect(await body(written)).toEqual({ written: 3 });
    expect((await kept(store))?.quarters).toEqual(quarters);

    const range = `from=${DAY}&to=${DAY + 2 * 86_400}`;
    expect(await body(await api.respond('GET', `/v1/energy?${range}`))).toEqual({
      meters: [{ meter: 'eredes', days: 2, energyWh: 600 }],
    });
    expect(await body(await api.respond('GET', `/v1/energy/days?meter=eredes&${range}`))).toEqual({
      days: [
        ['2026-01-15', 300, null],
        ['2026-01-16', 300, null],
      ],
    });
    const records = new DataView(
      await (await api.respond('GET', `/v1/energy/quarters?meter=eredes&${range}`)).arrayBuffer(),
    );
    expect([records.getUint32(8, true), records.getUint32(12, true)]).toEqual([DAY + 900, 200]);
    expect(await body(await api.respond('GET', `/v1/power?${range}`))).toEqual({
      devices: [],
      meters: [],
      days: [],
      eredes: { quarters: 3, maxEnergyWh: 300 },
    });
  });

  it('refuses what the server refuses', async () => {
    const { api } = server();
    const future = await api.respond('POST', '/v1/import/eredes', {
      quarters: [[NOW + 900, 100, 0]],
    });
    expect(future.status).toBe(400);
    const notQuarter = await api.respond('POST', '/v1/import/eredes', {
      quarters: [[DAY + 1, 100, 0]],
    });
    expect(notQuarter.status).toBe(400);
    expect(
      (await api.respond('GET', `/v1/energy/days?meter=x:0&from=${DAY}&to=${NOW}`)).status,
    ).toBe(400);
  });

  it('keeps one tariff per start date and removes it by id', async () => {
    const { store, api } = server();
    const tariff = {
      validFrom: '2026-01-01',
      supplier: null,
      powerVa: 6900,
      option: 'simple',
      cycle: 'daily',
      periodsMap: 'pre-2027',
      fixedPerDay: 400_000,
      energy: { simple: 160_000 },
      iecPerKwh: 0,
      cavPerMonth: 0,
      dgegPerMonth: 0,
      largeFamily: false,
      energyDiscountBp: 0,
      socialEnergyPerKwh: 0,
      socialPowerPerDay: 0,
      socialFinancingPerKwh: 0,
    };
    expect((await api.respond('POST', '/v1/tariffs', tariff)).status).toBe(201);
    expect((await api.respond('POST', '/v1/tariffs', { ...tariff, powerVa: 5750 })).status).toBe(
      201,
    );
    expect((await kept(store))?.tariffs).toMatchObject([{ id: 'local-2026-01-01', powerVa: 5750 }]);
    await api.respond('DELETE', '/v1/tariffs/local-2026-01-01');
    expect(await body(await api.respond('GET', '/v1/tariffs'))).toEqual({ tariffs: [] });
  });

  it('keeps what is always on, in this browser', async () => {
    const api = createLocalServer(memoryStore());
    const router = { label: 'Router', quantity: 1, powerW: 12, measured: false };
    expect((await api.respond('POST', '/v1/always-on', { ...router, quantity: 0 })).status).toBe(
      400,
    );
    const created = await api.respond('POST', '/v1/always-on', router);
    expect(created.status).toBe(201);
    const { item } = (await created.json()) as { item: { id: string } };

    const path = `/v1/always-on/${item.id}`;
    expect((await api.respond('PUT', path, { ...router, powerW: 9 })).status).toBe(204);
    expect((await api.respond('PUT', '/v1/always-on/nope', router)).status).toBe(404);
    expect(await body(await api.respond('GET', '/v1/always-on'))).toMatchObject({
      items: [{ ...router, powerW: 9, id: item.id }],
    });

    await api.respond('DELETE', path);
    expect(await body(await api.respond('GET', '/v1/always-on'))).toEqual({ items: [] });
  });

  it('keeps the equipment, one of a name, in this browser', async () => {
    const { store, api } = server();
    const kettle = {
      name: 'Chaleira',
      kind: 'kettle',
      brand: null,
      model: null,
      room: 'Cozinha',
      ratedPowerW: 2200,
      energyClass: null,
      notes: null,
      programmes: [],
    };
    const created = await api.respond('POST', '/v1/equipment', kettle);
    expect(created.status).toBe(201);
    const { item } = (await created.json()) as { item: { id: string } };
    // A request without an estimate (an older app) is kept with none.
    expect(item).toEqual({ ...kettle, estimate: null, id: item.id, createdAt: NOW });
    expect((await kept(store))?.equipment).toEqual([item]);

    const again = await api.respond('POST', '/v1/equipment', { ...kettle, name: ' CHALEIRA ' });
    expect(again.status).toBe(409);
    expect(await body(again)).toEqual({ error: 'name_taken' });
    const oven = await api.respond('POST', '/v1/equipment', { ...kettle, name: 'Forno' });
    const ovenId = ((await oven.json()) as { item: { id: string } }).item.id;
    const path = `/v1/equipment/${ovenId}`;
    expect((await api.respond('PUT', path, { ...kettle, name: 'chaleira' })).status).toBe(409);
    expect(
      (await api.respond('PUT', path, { ...kettle, name: 'Forno', room: 'Sala' })).status,
    ).toBe(204);
    expect((await api.respond('PUT', '/v1/equipment/nope', kettle)).status).toBe(404);
    // An app from before the estimate sends none: what is stored stays.
    const estimate = { basis: 'plate', minutesPerDay: 20 };
    await api.respond('PUT', path, { ...kettle, name: 'Forno', room: 'Sala', estimate });
    await api.respond('PUT', path, { ...kettle, name: 'Forno', room: 'Sala' });
    expect(await body(await api.respond('GET', '/v1/equipment'))).toMatchObject({
      items: [
        { name: 'Chaleira', estimate: null },
        { name: 'Forno', estimate },
      ],
    });
    expect((await api.respond('POST', `${path}/link`, { labels: ['Forno'] })).status).toBe(204);
    expect(await body(await api.respond('GET', '/v1/equipment'))).toMatchObject({
      items: [{ name: 'Chaleira' }, { name: 'Forno', room: 'Sala' }],
    });

    await api.respond('DELETE', path);
    expect(await body(await api.respond('GET', '/v1/equipment'))).toMatchObject({
      items: [{ name: 'Chaleira' }],
    });
  });

  it('keeps at most MAX_EQUIPMENT', async () => {
    const { api } = server();
    const bare = {
      kind: null,
      brand: null,
      model: null,
      room: null,
      ratedPowerW: null,
      energyClass: null,
      notes: null,
      programmes: [],
    };
    for (let index = 0; index < MAX_EQUIPMENT; index += 1) {
      await api.respond('POST', '/v1/equipment', { ...bare, name: `E${index}` });
    }
    const over = await api.respond('POST', '/v1/equipment', { ...bare, name: 'Mais' });
    expect(over.status).toBe(409);
    expect(await body(over)).toEqual({ error: 'too_many' });
  });

  it('has no Shelly, no alerts and keeps the AI key in the browser', async () => {
    const { api } = server();
    expect(await body(await api.respond('GET', '/v1/devices'))).toEqual({ devices: [] });
    expect((await api.respond('GET', '/v1/push/key')).status).toBe(503);
    expect((await api.respond('GET', '/v1/ai-settings')).status).toBe(503);
    expect(await body(await api.respond('GET', '/v1/now'))).toMatchObject({ meters: [] });
    expect((await api.respond('POST', '/v1/devices', { name: 'x' })).status).toBe(404);
  });

  it('reads the store again after a restore', async () => {
    const store = memoryStore();
    const { api } = server(store);
    expect(await body(await api.respond('GET', '/v1/household/location'))).toEqual({
      location: null,
    });
    const location = { name: 'Porto', latitudeCdeg: 4115, longitudeCdeg: -861 };
    await store.save({ ...emptyLocalData(), location });
    api.reload();
    expect(await body(await api.respond('GET', '/v1/household/location'))).toEqual({ location });
  });

  it('fails as a server when the browser does not keep the data', async () => {
    const store = { ...memoryStore(), save: () => Promise.resolve(false) };
    const { api } = server(store);
    expect((await api.respond('PUT', '/v1/quality/zone', { zone: 'A' })).status).toBe(507);
    expect(await body(await api.respond('GET', '/v1/quality'))).toMatchObject({ zone: null });
  });

  it('never writes over data it cannot read', async () => {
    const { store, save } = unreadableStore();
    const { api } = server(store);
    expect(await body(await api.respond('GET', '/v1/quality'))).toMatchObject({ zone: null });
    expect((await api.respond('PUT', '/v1/quality/zone', { zone: 'A' })).status).toBe(423);
    expect(save).not.toHaveBeenCalled();
  });

  it('reads again after a failed read, instead of keeping an empty house', async () => {
    const location = { name: 'Porto', latitudeCdeg: 4115, longitudeCdeg: -861 };
    const healthy = memoryStore({ ...emptyLocalData(), location });
    const load = vi.fn(healthy.load).mockResolvedValueOnce({ kind: 'unreadable' });
    const { api } = server({ ...healthy, load });
    expect(await body(await api.respond('GET', '/v1/household/location'))).toEqual({
      location: null,
    });
    expect(await body(await api.respond('GET', '/v1/household/location'))).toEqual({ location });
  });

  it('does not undo what another tab wrote', async () => {
    const store = memoryStore();
    const first = createLocalServer(store, () => NOW);
    const second = createLocalServer(store, () => NOW);
    await first.respond('GET', '/v1/quality'); // this tab now holds the empty house
    await second.respond('PUT', '/v1/quality/zone', { zone: 'B' });
    await first.respond('PUT', '/v1/household/budget', {
      budget: { cents: 5000, whPerDay: 8000 },
    });
    expect(await kept(store)).toMatchObject({
      zone: 'B',
      budget: { cents: 5000, whPerDay: 8000 },
    });
  });

  it('does not lose either of two writes made at once', async () => {
    const store = memoryStore();
    const { api } = server(store);
    await Promise.all([
      api.respond('PUT', '/v1/quality/zone', { zone: 'C' }),
      api.respond('PUT', '/v1/household/budget', { budget: { cents: 5000, whPerDay: 8000 } }),
    ]);
    expect(await kept(store)).toMatchObject({
      zone: 'C',
      budget: { cents: 5000, whPerDay: 8000 },
    });
  });

  it('keeps answering after a write that failed', async () => {
    const store = memoryStore();
    let refuse = true;
    const { api } = server({
      ...store,
      save: (data) => {
        if (refuse) throw new Error('refused');
        return store.save(data);
      },
    });
    await expect(api.respond('PUT', '/v1/quality/zone', { zone: 'A' })).rejects.toThrow();
    refuse = false;
    expect((await api.respond('PUT', '/v1/quality/zone', { zone: 'A' })).status).toBe(204);
  });

  it('says when the house changed, only once it is kept', async () => {
    const onChange = vi.fn();
    const refused = createLocalServer(
      { ...memoryStore(), save: () => Promise.resolve(false) },
      () => NOW,
      onChange,
    );
    await refused.respond('PUT', '/v1/quality/zone', { zone: 'A' });
    expect(onChange).not.toHaveBeenCalled();
    const api = createLocalServer(memoryStore(), () => NOW, onChange);
    await api.respond('PUT', '/v1/quality/zone', { zone: 'A' });
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('does not read the store for the visit of each page', async () => {
    const store = memoryStore();
    const load = vi.fn(store.load);
    const { api } = server({ ...store, load });
    await api.respond('POST', '/v1/visit', { path: '/' });
    expect(load).not.toHaveBeenCalled();
  });
});

describe('localDataSchema', () => {
  it('reads back what it keeps, and refuses another file', () => {
    expect(localDataSchema.safeParse(emptyLocalData()).success).toBe(true);
    expect(localDataSchema.safeParse({ version: 2 }).success).toBe(false);
    expect(localDataSchema.safeParse({ ...emptyLocalData(), quarters: [[1, 2, 3]] }).success).toBe(
      false,
    );
  });
});
