// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { programmeOf, rowOf } from './programme-row';

const MIX = { name: 'Mix', duration: '1:21', energy: '0,458', temperature: '40', load: '4,5' };

describe('programmeOf', () => {
  it('reads a programme as typed', () => {
    expect(programmeOf(MIX)).toEqual({
      name: 'Mix',
      durationS: 4860,
      energyWh: 458,
      temperatureC: 40,
      loadKg: 4.5,
    });
    expect(programmeOf({ ...MIX, temperature: '', load: ' ' })).toMatchObject({
      temperatureC: null,
      loadKg: null,
    });
  });

  it('refuses a temperature or a load the schema would refuse', () => {
    expect(programmeOf({ ...MIX, temperature: '40,5' })).toBeNull();
    expect(programmeOf({ ...MIX, temperature: 'abc' })).toBeNull();
    expect(programmeOf({ ...MIX, load: '4,3' })).toBeNull();
    expect(programmeOf({ ...MIX, energy: '' })).toBeNull();
  });

  it('writes a programme back as it is typed', () => {
    expect(rowOf(programmeOf(MIX)!)).toEqual(MIX);
  });
});
