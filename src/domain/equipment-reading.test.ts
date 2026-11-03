// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { fromPrinted, type PrintedEquipment } from './equipment-reading';

const PRINTED: PrintedEquipment = {
  kind: 'washer',
  brand: ' Exemplo ',
  model: 'WX-100',
  ratedPower: '2100 W',
  energyClass: 'a',
  programmes: [
    { name: 'Mix', duration: '1:21', energy: '0,46 kWh', temperature: '40 °C', load: '8 kg' },
    { name: 'Eco 40-60', duration: '3 h 48 min', energy: '1,011', temperature: null, load: '4,5' },
    { name: 'Rápido', duration: '?', energy: '0,3 kWh', temperature: 'Frio', load: null },
  ],
};

describe('fromPrinted', () => {
  it('turns what was read into the register’s values, leaving out what does not fit', () => {
    expect(fromPrinted(PRINTED)).toEqual({
      kind: 'washer',
      brand: 'Exemplo',
      model: 'WX-100',
      ratedPowerW: 2100,
      energyClass: 'A',
      programmes: [
        { name: 'Mix', durationS: 4860, energyWh: 460, temperatureC: 40, loadKg: 8 },
        { name: 'Eco 40-60', durationS: 13_680, energyWh: 1011, temperatureC: null, loadKg: 4.5 },
      ],
      refused: ['Rápido'],
    });
  });

  it('gives null for what the register does not take', () => {
    const reading = fromPrinted({
      kind: 'tostadeira',
      brand: '',
      model: null,
      ratedPower: '220-240 V',
      energyClass: 'A+++',
      programmes: [
        { name: 'Frio', duration: '0:30', energy: '0,2', temperature: 'Frio', load: null },
      ],
    });
    expect(reading).toMatchObject({
      kind: null,
      brand: null,
      model: null,
      ratedPowerW: null,
      energyClass: null,
      programmes: [{ name: 'Frio', temperatureC: null }],
      refused: [],
    });
  });
});
