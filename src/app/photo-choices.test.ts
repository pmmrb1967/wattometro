// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { EquipmentReading } from '../domain/equipment-reading';
import { applyChoices, decisionsOf, photoChoices, type FormValues } from './photo-choices';

const READING: EquipmentReading = {
  kind: 'washer',
  brand: 'Exemplo',
  model: 'WX-100',
  ratedPowerW: 2100,
  energyClass: null,
  label: null,
  programmes: [
    { name: 'Mix', durationS: 4860, energyWh: 460, temperatureC: 40, loadKg: 8 },
    { name: 'Eco 40-60', durationS: 13_680, energyWh: 1011, temperatureC: null, loadKg: 4.5 },
  ],
  refused: [],
};

const EMPTY: FormValues = {
  kind: '',
  brand: '',
  model: '',
  power: '',
  energyClass: '',
  rows: [],
  estimate: { basis: '', label: '', use: '' },
};

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

describe('the user’s choices over a form that changed', () => {
  it('works out the offer again from the form as it is now, keeping what was unticked', () => {
    const atSend = photoChoices(READING, EMPTY);
    const decisions = decisionsOf({
      ...atSend,
      fields: atSend.fields.map((field) => ({ ...field, checked: field.key !== 'power' })),
    });
    // While the AI read, the user typed a brand and a programme of the same name.
    const now: FormValues = {
      ...EMPTY,
      brand: 'Bosch',
      rows: [{ name: 'Eco 40-60', duration: '3:40', energy: '1', temperature: '', load: '' }],
    };
    const choices = photoChoices(READING, now, decisions);
    expect(choices.fields.find((field) => field.key === 'brand')).toEqual({
      key: 'brand',
      read: 'Exemplo',
      current: 'Bosch',
      checked: false,
    });
    expect(choices.fields.find((field) => field.key === 'power')?.checked).toBe(false);
    expect(choices.programmes.find((item) => item.row.name === 'Eco 40-60')).toMatchObject({
      replaces: true,
      checked: false,
    });
    expect(applyChoices(now, choices).brand).toBe('Bosch');
  });
});

describe('the energy label', () => {
  it('is not offered again when the form has the same value written otherwise', () => {
    const washer = { ...READING, label: { basis: 'cycles100' as const, labelWh: 58_000 } };
    const typed: FormValues = { ...EMPTY, estimate: { basis: 'cycles100', label: '58', use: '4' } };
    expect(photoChoices(washer, typed).fields.map((field) => field.key)).not.toContain('label');
  });

  it('counts a basis chosen without a label as empty, and ticks it', () => {
    const washer = { ...READING, label: { basis: 'cycles100' as const, labelWh: 58_000 } };
    const chosen: FormValues = { ...EMPTY, estimate: { basis: 'cycles100', label: '', use: '4' } };
    expect(photoChoices(washer, chosen).fields.find((field) => field.key === 'label')).toEqual({
      key: 'label',
      read: 'cycles100:58,000',
      current: '',
      checked: true,
    });
  });

  it('is ticked only when applying it leaves an estimate that can be saved', () => {
    const washer = { ...READING, label: { basis: 'cycles100' as const, labelWh: 58_000 } };
    const fridge = { ...READING, label: { basis: 'year' as const, labelWh: 250_000 } };
    const label = (choices: ReturnType<typeof photoChoices>) =>
      choices.fields.find((field) => field.key === 'label')?.checked;
    // Per 100 cycles needs the cycles a week: without them it would block "Guardar".
    expect(label(photoChoices(washer, EMPTY))).toBe(false);
    const withUse: FormValues = { ...EMPTY, estimate: { basis: '', label: '', use: '4' } };
    expect(label(photoChoices(washer, withUse))).toBe(true);
    // Per year needs nothing else.
    expect(label(photoChoices(fridge, EMPTY))).toBe(true);
  });

  it('fills the estimate’s basis and label, keeping the use typed', () => {
    const reading = { ...READING, label: { basis: 'cycles100' as const, labelWh: 58_000 } };
    const current: FormValues = { ...EMPTY, estimate: { basis: 'plate', label: '', use: '4' } };
    const choices = photoChoices(reading, current);
    expect(choices.fields.find((field) => field.key === 'label')).toEqual({
      key: 'label',
      read: 'cycles100:58,000',
      current: 'plate:',
      checked: false,
    });
    const ticked = {
      ...choices,
      fields: choices.fields.map((field) => ({ ...field, checked: true })),
    };
    expect(applyChoices(current, ticked).estimate).toEqual({
      basis: 'cycles100',
      label: '58,000',
      use: '4',
    });
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
      estimate: { basis: '', label: '', use: '' },
    });
  });
});
