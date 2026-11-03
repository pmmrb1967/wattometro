// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { equipmentInputSchema, fitsPlate, nameKey } from './equipment';

const washer = {
  name: 'Máquina da roupa',
  kind: 'washer',
  brand: 'LG',
  model: 'F4WV5009S0W',
  room: 'Lavandaria',
  ratedPowerW: 2100,
  energyClass: null,
  notes: null,
  programmes: [{ name: 'Mix', durationS: 4860, energyWh: 458, temperatureC: 35, loadKg: 4 }],
};

describe('fitsPlate', () => {
  it('takes what draws up to 110 % of the plate', () => {
    // Measured on 29/10 and 26/10: the airfryer at 95 %, the washer at 93 %.
    expect(fitsPlate(2084, 2200)).toBe(true);
    expect(fitsPlate(1961, 2100)).toBe(true);
    expect(fitsPlate(2310, 2100)).toBe(true);
    expect(fitsPlate(2311, 2100)).toBe(false);
  });

  it('takes anything without a plate', () => {
    expect(fitsPlate(5000, null)).toBe(true);
  });
});

describe('nameKey', () => {
  it('ignores case, accents kept, and the spaces around', () => {
    expect(nameKey('  Máquina da Roupa ')).toBe(nameKey('máquina da roupa'));
    expect(nameKey('MÁQUINA')).toBe('máquina');
  });
});

describe('equipmentInputSchema', () => {
  it('takes a washer with its manual', () => {
    expect(equipmentInputSchema.safeParse(washer).success).toBe(true);
  });

  it('takes just a name', () => {
    const bare = {
      name: 'Frigorífico',
      kind: null,
      brand: null,
      model: null,
      room: null,
      ratedPowerW: null,
      energyClass: null,
      notes: null,
      programmes: [],
    };
    expect(equipmentInputSchema.safeParse(bare).success).toBe(true);
  });

  it('refuses programmes on a kind without them, a blank name and too many programmes', () => {
    expect(equipmentInputSchema.safeParse({ ...washer, kind: 'airfryer' }).success).toBe(false);
    expect(equipmentInputSchema.safeParse({ ...washer, kind: null }).success).toBe(false);
    expect(equipmentInputSchema.safeParse({ ...washer, name: ' ' }).success).toBe(false);
    const many = Array.from({ length: 21 }, (_, index) => ({
      ...washer.programmes[0]!,
      name: `P${index}`,
    }));
    expect(equipmentInputSchema.safeParse({ ...washer, programmes: many }).success).toBe(false);
  });
});
