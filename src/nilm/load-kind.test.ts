// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { Cycle } from './cycles';
import { cycleLoadKind, groupLoadKind } from './load-kind';
import type { CycleGroup } from './summary';

const cycle = (powerW230: number, nonActiveVar: number) => ({ powerW230, nonActiveVar }) as Cycle;

function group(cycles: Cycle[], extra: Partial<CycleGroup> = {}): CycleGroup {
  return {
    powerW: cycles[0]!.powerW230,
    count: cycles.length,
    durationS: 60,
    energyWh: 10,
    statesW: [cycles[0]!.powerW230],
    pulsing: false,
    heats: null,
    cycles,
    ...extra,
  };
}

describe('cycleLoadKind', () => {
  it('reads the real house of 26 and 27/10', () => {
    // A heating: 1961 W, 138 var (7 %).
    expect(cycleLoadKind(cycle(1961, 138))).toBe('resistive');
    // The fridge: 169 W, 52 var (31 %); a microwave: 1741 W, 378 var (22 %).
    expect(cycleLoadKind(cycle(169, 52))).toBe('motor');
    expect(cycleLoadKind(cycle(1741, 378))).toBe('motor');
  });

  it('leaves small appliances and the middle unsaid', () => {
    // 155 W at 10 %: too small for its non-active power to tell.
    expect(cycleLoadKind(cycle(155, 15))).toBeNull();
    // 12 %: between the two.
    expect(cycleLoadKind(cycle(1000, 120))).toBeNull();
    // 36 % of 80 W is 29 var: within the noise of a step.
    expect(cycleLoadKind(cycle(80, 29))).toBeNull();
  });
});

describe('groupLoadKind', () => {
  it('says what two thirds of the cycles agree on', () => {
    expect(groupLoadKind(group([cycle(1200, 80), cycle(1210, 90), cycle(1190, 150)]))).toBe(
      'resistive',
    );
    expect(groupLoadKind(group([cycle(1200, 80), cycle(1210, 200), cycle(1190, 150)]))).toBeNull();
  });

  it('leaves whole programmes and appliances with several states out', () => {
    expect(groupLoadKind(group([cycle(1961, 138)], { heats: 1 }))).toBeNull();
    expect(groupLoadKind(group([cycle(2000, 100)], { statesW: [2000, 400] }))).toBeNull();
  });
});
