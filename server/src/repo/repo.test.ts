// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'vitest';
import { memorySql } from '../../test/sqlite';
import type { Sql } from '../db';
import { createDevice, findActiveDeviceByTokenHash, listDevices, revokeDevice } from './devices';
import { databaseState } from './health';
import {
  createHousehold,
  getHousehold,
  getHouseholdInstallation,
  setHouseholdInstallation,
} from './households';
import { addRowsRead, purgeRowsRead, rowsReadOn, utcDay } from './usage';
import { UNKNOWN_INSTALLATION } from '../../../src/domain/installation';

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

describe('household installation', () => {
  it('belongs to one household and is replaced on save', async () => {
    const house = await createHousehold(sql, 'Casa', NOW);
    const other = await createHousehold(sql, 'Outra', NOW);
    const mixed = {
      ...UNKNOWN_INSTALLATION,
      heating: ['gas-boiler' as const, 'electric-heaters' as const],
      airConditioning: false,
    };
    await setHouseholdInstallation(sql, house.id, mixed, NOW);
    expect(await getHouseholdInstallation(sql, house.id)).toEqual(mixed);
    expect(await getHouseholdInstallation(sql, other.id)).toEqual(UNKNOWN_INSTALLATION);
    await setHouseholdInstallation(sql, house.id, { ...mixed, heating: ['none'] }, NOW + 1);
    expect((await getHouseholdInstallation(sql, house.id)).heating).toEqual(['none']);
  });

  it('the database refuses kinds outside the list', async () => {
    const house = await createHousehold(sql, 'Casa', NOW);
    await expect(
      sql.run(
        'INSERT INTO household_installation (household_id, hob, updated_at) VALUES (?, ?, ?)',
        house.id,
        'oil',
        NOW,
      ),
    ).rejects.toThrow();
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
    expect(await findActiveDeviceByTokenHash(sql, HASH)).toEqual({
      ...device,
      rateWindow: null,
      rateCount: 0,
    });

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

describe('databaseState', () => {
  const failing = (message: string): Sql => ({
    first: () => Promise.reject(new Error(message)),
    all: () => Promise.reject(new Error(message)),
    run: () => Promise.reject(new Error(message)),
    batch: () => Promise.reject(new Error(message)),
  });

  it("is ok for a working database, limit past D1's daily limit, down otherwise", async () => {
    expect(await databaseState(sql)).toBe('ok');
    expect(
      await databaseState(failing("D1_ERROR: exceeded D1's free tier daily row read limit")),
    ).toBe('limit');
    expect(await databaseState(failing('down'))).toBe('down');
  });
});

describe('rows read per UTC day', () => {
  it('adds up per day and forgets the old days', async () => {
    await addRowsRead(sql, '2026-10-24', 100);
    await addRowsRead(sql, '2026-10-25', 30);
    await addRowsRead(sql, '2026-10-25', 12);
    await addRowsRead(sql, '2026-10-25', 0);
    expect(await rowsReadOn(sql, '2026-10-25')).toBe(42);
    await purgeRowsRead(sql, '2026-10-25');
    expect(await rowsReadOn(sql, '2026-10-24')).toBe(0);
    expect(await rowsReadOn(sql, '2026-10-25')).toBe(42);
    // Lisbon's 00:30 on the 26th in summer time is still the 25th in UTC.
    expect(utcDay(Date.parse('2026-10-25T23:30:00Z') / 1000)).toBe('2026-10-25');
  });
});
