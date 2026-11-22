// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CloudError, type CloudDrive } from '../cloud/drive';
import { MemoryDrive } from '../cloud/memory-drive';
import { tariffInputSchema } from '../domain/tariff';
import {
  backupName,
  BACKUPS_FOLDER,
  createKeyFile,
  decodeHouse,
  encodeHouse,
  housePath,
  KEY_FILE,
} from './cloud-files';
import { memoryCloudLinkStore, type CloudLink } from './cloud-state';
import {
  connectFirst,
  disconnect,
  joinCloud,
  resetSnapshotCache,
  syncOnce,
  type SyncDeps,
} from './cloud-sync';
import { emptyLocalData, LOCAL_VERSION, type LocalData, type LocalQuarter } from './data';
import { stampChanges } from './meta';
import { memoryStore, type LocalStore } from './store';

const ITER = 1_000;
const DAY = 86_400;
/** Midnight UTC, so the backup days are easy to count. */
const T0 = 1_800_000_000 - (1_800_000_000 % DAY);
const Q = 1_768_435_200; // a quarter start

const PASSWORD = 'segredo-forte';

let clock = T0;

const tariff = (validFrom: string): LocalData['tariffs'][number] => ({
  ...tariffInputSchema.parse({
    validFrom,
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
  }),
  id: `local-${validFrom}`,
});

const house = (patch: Partial<LocalData> = {}): LocalData => ({ ...emptyLocalData(), ...patch });
const quarters = (...starts: number[]): LocalQuarter[] => starts.map((ts) => [ts, 100, 0]);

function device(drive: CloudDrive, data: LocalData | null = null): SyncDeps {
  return {
    drive,
    house: memoryStore(data),
    links: memoryCloudLinkStore(),
    exclusive: (task) => task(),
    now: () => clock,
    onHouseChanged: vi.fn(),
  };
}

/** A change made here, stamped as the local server does. */
async function edit(deps: SyncDeps, change: (data: LocalData) => LocalData): Promise<void> {
  const read = await deps.house.load();
  const before = read.kind === 'ok' ? read.data : emptyLocalData();
  const after = change(before);
  await deps.house.save(after, stampChanges(before, after, await deps.house.loadMeta(), clock));
}

async function houseOf(deps: SyncDeps): Promise<LocalData | null> {
  const read = await deps.house.load();
  return read.kind === 'ok' ? read.data : null;
}

async function linkOf(deps: SyncDeps): Promise<CloudLink> {
  const link = await deps.links.load();
  if (!link) throw new Error('not linked');
  return link;
}

const versions = (drive: MemoryDrive) =>
  [...drive.files].map(([path, file]) => [path, file.etag] as const);

const backups = (drive: MemoryDrive) =>
  [...drive.files.keys()].filter((path) => path.startsWith(`${BACKUPS_FOLDER}/`)).sort();

async function connected(patch: Partial<LocalData> = { quarters: quarters(Q) }) {
  const drive = new MemoryDrive();
  const a = device(drive, house(patch));
  await connectFirst(a, PASSWORD, { label: 'paulo@example.com' }, ITER);
  return { drive, a };
}

beforeEach(() => {
  clock = T0 + 3_600;
  resetSnapshotCache();
});

describe('syncOnce', () => {
  it('two devices end with the same house', async () => {
    const { drive, a } = await connected();
    clock += 60;
    const b = device(drive);
    await joinCloud(b, { password: PASSWORD }, 'replace', {});
    expect((await houseOf(b))?.quarters).toEqual(quarters(Q));

    clock += 60;
    await edit(a, (data) => ({ ...data, tariffs: [tariff('2026-01-01')] }));
    await syncOnce(a);
    clock += 60;
    await edit(b, (data) => ({ ...data, zone: 'B' }));
    await syncOnce(b);
    clock += 60;
    await syncOnce(a);

    const houseA = await houseOf(a);
    expect(houseA).toEqual(await houseOf(b));
    expect(houseA?.tariffs).toEqual([tariff('2026-01-01')]);
    expect(houseA?.zone).toBe('B');
    expect(await a.house.loadMeta()).toEqual(await b.house.loadMeta());
  });

  it('an unreadable local house writes nothing', async () => {
    const { drive, a } = await connected();
    const b = device(drive);
    await joinCloud(b, { password: PASSWORD }, 'replace', {});
    clock += 60;
    await edit(b, (data) => ({ ...data, zone: 'C' }));
    await syncOnce(b);

    const unreadable: LocalStore = {
      ...a.house,
      load: () => Promise.resolve({ kind: 'unreadable' }),
    };
    const before = versions(drive);
    const result = await syncOnce({ ...a, house: unreadable });
    expect(versions(drive)).toEqual(before);
    expect(result.error).toBeUndefined();
    expect(result.pushed).toBe(false);
  });

  it('missing chave.json disconnects without writing', async () => {
    const { drive, a } = await connected();
    drive.files.delete(KEY_FILE);
    clock += 60;
    await edit(a, (data) => ({ ...data, zone: 'A' }));
    const before = versions(drive);
    const result = await syncOnce(a);
    expect(result.error).toBe('removed');
    expect(await a.links.load()).toBeNull();
    expect(versions(drive)).toEqual(before);
    expect((await houseOf(a))?.zone).toBe('A');
  });

  it('a chave.json with another keyId disconnects too', async () => {
    const { drive, a } = await connected();
    drive.files.delete(KEY_FILE);
    await createKeyFile(drive, 'outra', ITER);
    clock += 60;
    await edit(a, (data) => ({ ...data, zone: 'A' }));
    const before = versions(drive);
    expect((await syncOnce(a)).error).toBe('removed');
    expect(await a.links.load()).toBeNull();
    expect(versions(drive)).toEqual(before);
  });

  it('a corrupt snapshot of one device does not stop the others', async () => {
    const { drive, a } = await connected();
    const b = device(drive);
    await joinCloud(b, { password: PASSWORD }, 'replace', {});
    drive.files.set(housePath('zzz'), { bytes: new TextEncoder().encode('lixo'), etag: 'x1' });
    clock += 60;
    await edit(b, (data) => ({ ...data, zone: 'B' }));
    await syncOnce(b);

    const result = await syncOnce(a);
    expect(result.error).toBe('unreadable_device');
    expect((await houseOf(a))?.zone).toBe('B');
    expect(result.pushed).toBe(true);
    expect((await linkOf(a)).error).toBe('unreadable_device');
  });

  it('a snapshot of a newer app stops with newer_app and writes nothing', async () => {
    const { drive, a } = await connected();
    const link = await linkOf(a);
    const bytes = await encodeHouse(link, {
      version: LOCAL_VERSION + 1,
      deviceId: 'futuro',
      writtenAt: clock,
      data: house({ zone: 'C' }),
      meta: await a.house.loadMeta(),
    });
    drive.files.set(housePath('futuro'), { bytes, etag: 'f1' });
    clock += 60;
    await edit(a, (data) => ({ ...data, zone: 'A' }));
    const before = versions(drive);
    const kept = await houseOf(a);
    const keptMeta = await a.house.loadMeta();

    const result = await syncOnce(a);
    expect(result.error).toBe('newer_app');
    expect(result.pushed).toBe(false);
    expect(versions(drive)).toEqual(before);
    expect(await houseOf(a)).toEqual(kept);
    expect(await a.house.loadMeta()).toEqual(keptMeta);
  });

  it('needs_reconnect is kept on the link and nothing is lost', async () => {
    const { drive, a } = await connected();
    clock += 60;
    await edit(a, (data) => ({ ...data, zone: 'A' }));
    drive.failNext('needs_reconnect');
    const failed = await syncOnce(a);
    expect(failed.error).toBe('needs_reconnect');
    expect((await linkOf(a)).error).toBe('needs_reconnect');
    expect((await houseOf(a))?.zone).toBe('A');

    clock += 60;
    const result = await syncOnce(a);
    expect(result.error).toBeUndefined();
    expect(result.pushed).toBe(true);
    expect((await linkOf(a)).error).toBeUndefined();

    const b = device(drive);
    await joinCloud(b, { password: PASSWORD }, 'replace', {});
    expect((await houseOf(b))?.zone).toBe('A');
  });

  it('throttled keeps retryAfter in the error and does not push', async () => {
    const { drive, a } = await connected();
    clock += 60;
    await edit(a, (data) => ({ ...data, zone: 'A' }));
    let throttle = true;
    const throttled: CloudDrive = {
      read: (path) => drive.read(path),
      list: (folder) => drive.list(folder),
      remove: (path) => drive.remove(path),
      account: () => drive.account(),
      write: (path, bytes, options) => {
        if (throttle) {
          throttle = false;
          return Promise.reject(new CloudError('throttled', 30));
        }
        return drive.write(path, bytes, options);
      },
    };
    const before = versions(drive);
    const result = await syncOnce({ ...a, drive: throttled });
    expect(result).toMatchObject({ error: 'throttled', retryAfterSeconds: 30, pushed: false });
    expect(versions(drive)).toEqual(before);
    expect((await linkOf(a)).error).toBe('throttled');
  });

  it('a second write in the same second is pushed on the next cycle', async () => {
    const { drive, a } = await connected();
    clock += 60;
    await edit(a, (data) => ({ ...data, zone: 'A' }));
    expect((await syncOnce(a)).pushed).toBe(true);
    await edit(a, (data) => ({ ...data, tariffs: [tariff('2026-01-01')] }));
    expect((await syncOnce(a)).pushed).toBe(true);

    const b = device(drive);
    await joinCloud(b, { password: PASSWORD }, 'replace', {});
    expect((await houseOf(b))?.tariffs).toEqual([tariff('2026-01-01')]);
  });

  it("a peer's clock ahead does not stop this device's own edits from being pushed", async () => {
    const { drive, a } = await connected();
    const b = { ...device(drive), now: () => clock + 3_600 };
    await joinCloud(b, { password: PASSWORD }, 'replace', {});
    clock += 60;
    const read = await b.house.load();
    const before = read.kind === 'ok' ? read.data : emptyLocalData();
    const after = { ...before, zone: 'C' as const };
    await b.house.save(after, stampChanges(before, after, await b.house.loadMeta(), clock + 3_600));
    await syncOnce(b);
    await syncOnce(a);
    expect((await houseOf(a))?.zone).toBe('C');

    clock += 60;
    await edit(a, (data) => ({ ...data, tariffs: [tariff('2026-01-01')] }));
    expect((await syncOnce(a)).pushed).toBe(true);
    await syncOnce(b);
    expect((await houseOf(b))?.tariffs).toEqual([tariff('2026-01-01')]);
  });

  it('reads again only the snapshots whose etag changed', async () => {
    const { drive, a } = await connected();
    const b = device(drive);
    await joinCloud(b, { password: PASSWORD }, 'replace', {});
    resetSnapshotCache();
    expect((await syncOnce(a)).pulled).toBe(1);
    expect((await syncOnce(a)).pulled).toBe(0);
    clock += 60;
    await edit(b, (data) => ({ ...data, zone: 'B' }));
    await syncOnce(b);
    expect((await syncOnce(a)).pulled).toBe(1);
    expect((await houseOf(a))?.zone).toBe('B');
  });

  it('merged house is written through exclusive', async () => {
    const { drive, a } = await connected();
    const b = device(drive);
    await joinCloud(b, { password: PASSWORD }, 'replace', {});
    clock += 60;
    await edit(b, (data) => ({ ...data, zone: 'B' }));
    await syncOnce(b);

    let inside = false;
    const saves: boolean[] = [];
    const store: LocalStore = {
      ...a.house,
      save: (data, meta) => {
        saves.push(inside);
        return a.house.save(data, meta);
      },
    };
    let calls = 0;
    const exclusive = async <T>(task: () => Promise<T>): Promise<T> => {
      calls += 1;
      inside = true;
      try {
        return await task();
      } finally {
        inside = false;
      }
    };
    await syncOnce({ ...a, house: store, exclusive });
    expect(calls).toBeGreaterThan(0);
    expect(saves).toEqual([true]);
    expect((await houseOf(a))?.zone).toBe('B');
    expect(a.onHouseChanged).toHaveBeenCalledTimes(1);
  });
});

describe('joinCloud', () => {
  it('join adds the browser house without taking from the cloud', async () => {
    const { drive, a } = await connected({
      quarters: quarters(Q),
      tariffs: [tariff('2026-01-01')],
    });
    clock += 60;
    const b = device(drive);
    await edit(b, (data) => ({
      ...data,
      quarters: quarters(Q + 900),
      tariffs: [tariff('2026-05-01')],
      zone: 'A',
    }));
    clock += 60;
    await joinCloud(b, { password: PASSWORD }, 'join', {});
    clock += 60;
    await syncOnce(a);

    for (const deps of [a, b]) {
      const data = await houseOf(deps);
      expect(data?.quarters).toEqual(quarters(Q, Q + 900));
      expect(data?.tariffs).toEqual([tariff('2026-01-01')]);
      expect(data?.zone).toBe('A');
    }
  });

  it('an empty house joined later does not empty the cloud', async () => {
    const { drive, a } = await connected({
      quarters: quarters(Q),
      tariffs: [tariff('2026-01-01')],
      zone: 'B',
    });
    const kept = await houseOf(a);
    clock += 60;
    const b = device(drive, emptyLocalData());
    await joinCloud(b, { password: PASSWORD }, 'join', {});
    clock += 60;
    await syncOnce(a);
    expect(await houseOf(a)).toEqual(kept);
    expect(await houseOf(b)).toEqual(kept);
  });

  it('a wrong password is refused and links nothing', async () => {
    const { drive } = await connected();
    const b = device(drive);
    await expect(joinCloud(b, { password: 'errada' }, 'join', {})).rejects.toMatchObject({
      code: 'wrong_secret',
    });
    expect(await b.links.load()).toBeNull();
  });
});

describe('backups', () => {
  it('backup every 7 days, shared between devices', async () => {
    const { drive, a } = await connected();
    const day = (offset: number) => new Date((T0 + offset * DAY) * 1000).toISOString().slice(0, 10);
    const idA = (await linkOf(a)).deviceId;
    expect(backups(drive)).toEqual([`${BACKUPS_FOLDER}/${backupName(day(0), idA)}`]);

    clock = T0 + DAY + 3_600;
    const b = device(drive);
    await joinCloud(b, { password: PASSWORD }, 'replace', {});
    const idB = (await linkOf(b)).deviceId;

    clock = T0 + 3 * DAY + 3_600;
    await edit(b, (data) => ({ ...data, zone: 'A' }));
    expect((await syncOnce(b)).backup).toBe(false);

    clock = T0 + 8 * DAY + 3_600;
    await edit(b, (data) => ({ ...data, zone: 'B' }));
    expect((await syncOnce(b)).backup).toBe(true);
    expect(backups(drive)).toEqual([
      `${BACKUPS_FOLDER}/${backupName(day(0), idA)}`,
      `${BACKUPS_FOLDER}/${backupName(day(8), idB)}`,
    ]);

    // The backup is the merged house, readable with the folder's key.
    const file = drive.files.get(`${BACKUPS_FOLDER}/${backupName(day(8), idB)}`);
    const decoded = await decodeHouse(await linkOf(b), file?.bytes ?? new Uint8Array());
    expect(decoded.kind === 'ok' && decoded.payload.data.zone).toBe('B');
  });

  it('no backup when the house did not change since the last one', async () => {
    const drive = new MemoryDrive();
    const day1 = new Date((T0 + DAY) * 1000).toISOString().slice(0, 10);
    const other = `${BACKUPS_FOLDER}/${backupName(day1, 'other')}`;
    drive.files.set(other, { bytes: new Uint8Array([1]), etag: 'o' });
    const a = device(drive, house({ quarters: quarters(Q) }));
    await connectFirst(a, PASSWORD, {}, ITER);
    // Every change of the house is older than the day of that backup.
    clock = T0 + 9 * DAY;
    expect((await syncOnce(a)).backup).toBe(false);
    expect(backups(drive)).toEqual([other]);
  });

  it('keeps the 8 newest backups and never removes other files', async () => {
    const drive = new MemoryDrive();
    const old = Array.from({ length: 9 }, (_, index) =>
      backupName(new Date((T0 - (30 - index) * DAY) * 1000).toISOString().slice(0, 10), 'old'),
    );
    for (const name of [...old, 'notas.txt', 'wattometro-copia.bin']) {
      drive.files.set(`${BACKUPS_FOLDER}/${name}`, { bytes: new Uint8Array([1]), etag: name });
    }
    const a = device(drive, house({ quarters: quarters(Q) }));
    await connectFirst(a, PASSWORD, {}, ITER);

    const idA = (await linkOf(a)).deviceId;
    const today = new Date(T0 * 1000).toISOString().slice(0, 10);
    expect(backups(drive)).toEqual(
      [...old.slice(2), backupName(today, idA), 'notas.txt', 'wattometro-copia.bin']
        .map((name) => `${BACKUPS_FOLDER}/${name}`)
        .sort(),
    );
  });
});

describe('disconnect', () => {
  async function two() {
    const { drive, a } = await connected();
    const b = device(drive);
    await joinCloud(b, { password: PASSWORD }, 'replace', {});
    drive.files.set(`${BACKUPS_FOLDER}/notas.txt`, { bytes: new Uint8Array([1]), etag: 'n' });
    return { drive, a, b, idA: (await linkOf(a)).deviceId, idB: (await linkOf(b)).deviceId };
  }

  it("disconnect removes only this device's snapshot", async () => {
    const { drive, a, idA, idB } = await two();
    const kept = await houseOf(a);
    await disconnect(a, { removeCloud: false });
    expect(drive.files.has(housePath(idA))).toBe(false);
    expect(drive.files.has(housePath(idB))).toBe(true);
    expect(drive.files.has(KEY_FILE)).toBe(true);
    expect(backups(drive).length).toBeGreaterThan(1);
    expect(await a.links.load()).toBeNull();
    expect(await houseOf(a)).toEqual(kept);
  });

  it('removeCloud removes chave.json first and keeps the link when a removal fails', async () => {
    const { drive, a, b } = await two();
    const removed: string[] = [];
    const failing: CloudDrive = {
      read: (path) => drive.read(path),
      list: (folder) => drive.list(folder),
      write: (path, bytes, options) => drive.write(path, bytes, options),
      account: () => drive.account(),
      remove: (path) => {
        removed.push(path);
        if (removed.length === 2) return Promise.reject(new CloudError('offline'));
        return drive.remove(path);
      },
    };
    await expect(disconnect({ ...a, drive: failing }, { removeCloud: true })).rejects.toMatchObject(
      { code: 'offline' },
    );
    expect(removed[0]).toBe(KEY_FILE);
    expect(drive.files.has(KEY_FILE)).toBe(false);
    expect(await a.links.load()).not.toBeNull();

    clock += 60;
    await edit(b, (data) => ({ ...data, zone: 'A' }));
    const before = versions(drive);
    expect((await syncOnce(b)).error).toBe('removed');
    expect(versions(drive)).toEqual(before);
  });

  it('disconnect with removeCloud empties the folder', async () => {
    const { drive, a, b } = await two();
    await disconnect(a, { removeCloud: true });
    expect([...drive.files.keys()]).toEqual([`${BACKUPS_FOLDER}/notas.txt`]);
    expect(await a.links.load()).toBeNull();
    expect((await syncOnce(b)).error).toBe('removed');
  });
});
