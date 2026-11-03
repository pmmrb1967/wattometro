// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { Programme } from './equipment';
import {
  averageDifferencePct,
  energyDifferencePct,
  likelyProgramme,
  programmeUses,
} from './equipment-programmes';

const programme = (name: string, durationS: number, energyWh: number): Programme => ({
  name,
  durationS,
  energyWh,
  temperatureC: null,
  loadKg: null,
});

// The LG F4WV5009S0W manual (photo of 03/11): h:mm and kWh per programme.
const MANUAL = [
  programme('Algodão 20 °C', 6660, 177),
  programme('Mix', 4860, 458),
  programme('14 Minutos', 840, 46),
  programme('Eco 40-60', 13680, 1011),
];

describe('likelyProgramme', () => {
  it('takes the closest duration: the washes calibrated on 26/10 and 29/10 are Mix', () => {
    // 5400 s is 540 s from Mix (within 25 % of 4860 s, 1215 s) and 1260 s from Algodão 20 °C.
    expect(likelyProgramme(5400, MANUAL)?.name).toBe('Mix');
    expect(likelyProgramme(5340, MANUAL)?.name).toBe('Mix');
    expect(likelyProgramme(13000, MANUAL)?.name).toBe('Eco 40-60');
  });

  it('names none when no programme is within 25 %', () => {
    // The programme of 02/11, its end cut by the detection: 32 % from Mix.
    expect(likelyProgramme(3300, MANUAL)).toBeNull();
    expect(likelyProgramme(5400, [])).toBeNull();
  });
});

describe('energyDifferencePct', () => {
  it('is the measured against the manual, in whole percent', () => {
    // (570 − 458) / 458 = 24,5 %; (535 − 458) / 458 = 16,8 %.
    expect(energyDifferencePct(570, 458)).toBe(24);
    expect(energyDifferencePct(535, 458)).toBe(17);
    expect(energyDifferencePct(400, 458)).toBe(-13);
    expect(energyDifferencePct(10, 0)).toBeNull();
  });
});

describe('programmeUses', () => {
  it('takes only whole programmes, the latest first', () => {
    const uses = programmeUses(
      [
        { start: 100, durationS: 5400, energyWh: 570, heats: { count: 1 } },
        { start: 300, durationS: 700, energyWh: 300 },
        { start: 200, durationS: 3300, energyWh: 500, heats: { count: 1 } },
      ],
      MANUAL,
    );
    expect(uses.map((use) => [use.start, use.programme?.name ?? null, use.differencePct])).toEqual([
      [200, null, null],
      [100, 'Mix', 24],
    ]);
  });
});

describe('averageDifferencePct', () => {
  it('averages the uses with a programme', () => {
    const uses = programmeUses(
      [
        { start: 1, durationS: 5400, energyWh: 570, heats: { count: 1 } },
        { start: 2, durationS: 5340, energyWh: 535, heats: { count: 1 } },
        { start: 3, durationS: 3300, energyWh: 500, heats: { count: 1 } },
      ],
      MANUAL,
    );
    // (24 + 17) / 2 = 20,5 → 21.
    expect(averageDifferencePct(uses)).toBe(21);
    expect(averageDifferencePct([])).toBeNull();
  });
});
