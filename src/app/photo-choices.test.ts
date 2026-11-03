// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { EquipmentReading } from '../domain/equipment-reading';
import { applyChoices, photoChoices, type FormValues } from './photo-choices';

const READING: EquipmentReading = {
  kind: 'washer',
  brand: 'Exemplo',
  model: 'WX-100',
  ratedPowerW: 2100,
  energyClass: null,
  programmes: [
    { name: 'Mix', durationS: 4860, energyWh: 460, temperatureC: 40, loadKg: 8 },
    { name: 'Eco 40-60', durationS: 13_680, energyWh: 1011, temperatureC: null, loadKg: 4.5 },
  ],
  refused: [],
};

const EMPTY: FormValues = { kind: '', brand: '', model: '', power: '', energyClass: '', rows: [] };

describe('photoChoices', () => {
  it('offers what was read, ticked where the form is empty and not where it would replace', () => {
    const current: FormValues = {
      ...EMPTY,
      model: 'WX-1OO',
      rows: [{ name: 'mix', duration: '1:20', energy: '0,45', temperature: '', load: '' }],
    };
    const choices = photoChoices(READING, current);
    expect(choices.fields).toEqual([
      { key: 'kind', read: 'washer', current: '', checked: true },
      { key: 'brand', read: 'Exemplo', current: '', checked: true },
      { key: 'model', read: 'WX-100', current: 'WX-1OO', checked: false },
      { key: 'power', read: '2100', current: '', checked: true },
    ]);
    expect(
      choices.programmes.map(({ row, replaces, checked }) => [row.name, replaces, checked]),
    ).toEqual([
      ['Mix', true, false],
      ['Eco 40-60', false, true],
    ]);
  });

  it('leaves out what is already in the form', () => {
    const current: FormValues = { ...EMPTY, kind: 'washer', brand: 'Exemplo' };
    expect(photoChoices(READING, current).fields.map((field) => field.key)).toEqual([
      'model',
      'power',
    ]);
  });
});

describe('applyChoices', () => {
  it('fills only what was ticked: a programme of the same name is replaced, a new one added', () => {
    const current: FormValues = {
      ...EMPTY,
      model: 'WX-1OO',
      rows: [{ name: 'mix', duration: '1:20', energy: '0,45', temperature: '', load: '' }],
    };
    const choices = photoChoices(READING, current);
    const ticked = {
      fields: choices.fields.map((field) => ({ ...field, checked: field.key !== 'brand' })),
      programmes: choices.programmes.map((item) => ({ ...item, checked: true })),
    };
    expect(applyChoices(current, ticked)).toEqual({
      kind: 'washer',
      brand: '',
      model: 'WX-100',
      power: '2100',
      energyClass: '',
      rows: [
        { name: 'Mix', duration: '1:21', energy: '0,460', temperature: '40', load: '8' },
        { name: 'Eco 40-60', duration: '3:48', energy: '1,011', temperature: '', load: '4,5' },
      ],
    });
  });
});
