// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { programmeUses } from '../domain/equipment-programmes';
import { programmeText } from './programme-text';

const MIX = { name: 'Mix', durationS: 4860, energyWh: 458, temperatureC: 40, loadKg: 4 };

describe('programmeText', () => {
  it('says the likely programme and the energy against the manual', () => {
    const [use] = programmeUses(
      [{ start: 0, durationS: 5400, energyWh: 570, heats: { count: 1, onS: 900 } }],
      [MIX],
    );
    expect(programmeText(use!)).toBe(
      'Parece o programa Mix: o manual diz 1:21 e 0,46 kWh; este usou 0,57 kWh, mais 24 % do que o manual.',
    );
  });

  it('says when no programme of the manual is near', () => {
    const [use] = programmeUses(
      [{ start: 0, durationS: 3300, energyWh: 500, heats: { count: 1, onS: 900 } }],
      [MIX],
    );
    expect(programmeText(use!)).toBe(
      'Programa não identificado: nenhum programa do manual dura perto de 55 min.',
    );
  });
});
