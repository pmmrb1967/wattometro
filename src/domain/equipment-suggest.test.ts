// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { Equipment } from './equipment';
import { suggestEquipment, uncalibrated } from './equipment-suggest';

const item = (id: string, name: string, ratedPowerW: number | null): Equipment => ({
  id,
  name,
  kind: null,
  brand: null,
  model: null,
  room: null,
  ratedPowerW,
  energyClass: null,
  notes: null,
  programmes: [],
  createdAt: 0,
});

const AIRFRYER = item('a', 'Airfryer', 2200);
const WASHER = item('w', 'Máquina da roupa', 2100);
const KETTLE = item('k', 'Chaleira', 1500);
const FRIDGE = item('f', 'Frigorífico', null);

describe('suggestEquipment', () => {
  it('puts first what the plate allows, each part by name', () => {
    // The airfryer of 29/10 drew 2084 W: the kettle's plate (1500 W) cannot be it.
    expect(
      suggestEquipment(2084, [KETTLE, WASHER, FRIDGE, AIRFRYER]).map(({ item, fits }) => [
        item.name,
        fits,
      ]),
    ).toEqual([
      ['Airfryer', true],
      ['Frigorífico', true],
      ['Máquina da roupa', true],
      ['Chaleira', false],
    ]);
  });
});

describe('uncalibrated', () => {
  it('is the equipment no recognised appliance is linked to', () => {
    const appliances = [{ equipmentId: 'w' }, { equipmentId: null }, { equipmentId: 'w' }];
    expect(uncalibrated([AIRFRYER, WASHER, KETTLE], appliances).map((each) => each.id)).toEqual([
      'a',
      'k',
    ]);
  });
});
