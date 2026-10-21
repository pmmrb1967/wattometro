// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'vitest';
import { memorySql } from '../../test/sqlite';
import type { Sql } from '../db';
import { createDevice, findActiveDeviceByTokenHash, listDevices, revokeDevice } from './devices';
import { databaseReachable } from './health';
import { createHousehold, getHousehold } from './households';

const NOW = 1_792_000_000;
const HASH = 'a'.repeat(64);

let sql: Sql;

beforeEach(() => {
  sql = memorySql().sql;
});

describe('households', () => {
  it('creates and reads a household', async () => {
    const created = await createHousehold(sql, 'Casa', NOW);
    expect(await getHousehold(sql, created.id)).toEqual({
      id: created.id,
      name: 'Casa',
      createdAt: NOW,
    });
    expect(await getHousehold(sql, 'missing')).toBeNull();
  });
});

describe('devices', () => {
  it('finds a device by token hash until it is revoked', async () => {
    const home = await createHousehold(sql, 'Casa', NOW);
    const device = await createDevice(
      sql,
      { householdId: home.id, name: 'Quadro', model: 'S3EM', tokenHash: HASH },
      NOW,
    );
    expect(await findActiveDeviceByTokenHash(sql, HASH)).toEqual(device);

    await revokeDevice(sql, home.id, device.id, NOW + 60);
    expect(await findActiveDeviceByTokenHash(sql, HASH)).toBeNull();
    expect((await listDevices(sql, home.id))[0]?.revokedAt).toBe(NOW + 60);
  });

  it('keeps households apart', async () => {
    const mine = await createHousehold(sql, 'Minha', NOW);
    const other = await createHousehold(sql, 'Outra', NOW);
    const device = await createDevice(
      sql,
      { householdId: mine.id, name: 'Quadro', tokenHash: HASH },
      NOW,
    );

    expect(await listDevices(sql, other.id)).toEqual([]);
    await revokeDevice(sql, other.id, device.id, NOW);
    expect(await findActiveDeviceByTokenHash(sql, HASH)).not.toBeNull();
  });

  it('rejects a repeated token hash and an unknown household', async () => {
    const home = await createHousehold(sql, 'Casa', NOW);
    await createDevice(sql, { householdId: home.id, name: 'A', tokenHash: HASH }, NOW);
    await expect(
      createDevice(sql, { householdId: home.id, name: 'B', tokenHash: HASH }, NOW),
    ).rejects.toThrow();
    await expect(
      createDevice(sql, { householdId: 'missing', name: 'C', tokenHash: 'b'.repeat(64) }, NOW),
    ).rejects.toThrow();
  });

  it('never exposes the token hash', async () => {
    const home = await createHousehold(sql, 'Casa', NOW);
    await createDevice(sql, { householdId: home.id, name: 'Quadro', tokenHash: HASH }, NOW);
    expect(JSON.stringify(await listDevices(sql, home.id))).not.toContain(HASH);
  });
});

describe('databaseReachable', () => {
  it('is true for a working database and false when queries fail', async () => {
    expect(await databaseReachable(sql)).toBe(true);
    const broken: Sql = {
      first: () => Promise.reject(new Error('down')),
      all: () => Promise.reject(new Error('down')),
      run: () => Promise.reject(new Error('down')),
    };
    expect(await databaseReachable(broken)).toBe(false);
  });
});
