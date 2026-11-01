// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { emptyLocalData, LOCAL_VERSION } from './data';
import { readStored } from './stored';

/**
 * A household exactly as version 1 keeps it, in this browser and in the backup
 * files people already have. If this stops being read, a shared schema changed
 * the format: raise LOCAL_VERSION and add a migration; do not edit this.
 */
const STORED_V1 = {
  version: 1,
  quarters: [
    [1_768_435_200, 100, 0],
    [1_768_436_100, 200, 1],
  ],
  tariffs: [
    {
      id: 'local-2026-01-01',
      validFrom: '2026-01-01',
      supplier: 'Exemplo',
      powerVa: 6900,
      option: 'bi',
      cycle: 'daily',
      periodsMap: 'pre-2027',
      fixedPerDay: 400_000,
      energy: { offEmpty: 180_000, empty: 100_000 },
      energyDiscountBp: 400,
      socialEnergyPerKwh: 0,
      socialPowerPerDay: 0,
      socialFinancingPerKwh: 0,
      iecPerKwh: 1_000,
      cavPerMonth: 2_850_000,
      dgegPerMonth: 70_000,
      largeFamily: false,
    },
  ],
  zone: 'B',
  location: { name: 'Porto', latitudeCdeg: 4115, longitudeCdeg: -861 },
  budget: { cents: 5000, whPerDay: 8000 },
  installation: {
    heating: ['gas-boiler'],
    airConditioning: false,
    waterHeating: 'gas',
    hob: 'gas',
    solarPanels: false,
    electricCar: false,
  },
};

describe('readStored', () => {
  it('reads version 1 as it was kept', () => {
    const read = readStored(STORED_V1);
    expect(read.kind).toBe('ok');
    expect(read.kind === 'ok' && read.data).toEqual(STORED_V1);
  });

  it('tells nothing kept from something it cannot read', () => {
    expect(readStored(undefined)).toEqual({ kind: 'empty' });
    expect(readStored({ quarters: 'x' })).toEqual({ kind: 'unreadable', raw: { quarters: 'x' } });
  });

  it('does not read a newer version: an old copy of the app must not take it for empty', () => {
    const newer = { ...emptyLocalData(), version: LOCAL_VERSION + 1 };
    expect(readStored(newer)).toEqual({ kind: 'unreadable', raw: newer });
  });

  it('brings an older version up to date, step by step', () => {
    const { zone, ...rest } = emptyLocalData();
    const older = { ...rest, version: 0, qualityZone: zone };
    const read = readStored(older, {
      0: ({ qualityZone, ...others }) => ({ ...others, zone: qualityZone }),
    });
    expect(read).toEqual({ kind: 'ok', data: emptyLocalData() });
  });

  it('keeps an older version it has no migration for, or whose migration fails', () => {
    const older = { ...emptyLocalData(), version: 0 };
    expect(readStored(older, {})).toEqual({ kind: 'unreadable', raw: older });
    const failing = () => {
      throw new Error('bad');
    };
    expect(readStored(older, { 0: failing })).toEqual({ kind: 'unreadable', raw: older });
  });
});
