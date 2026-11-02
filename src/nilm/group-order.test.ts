// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { parseGroupOrder, sortGroups } from './group-order';
import type { CycleGroup } from './summary';
import type { Cycle } from './cycles';

function row(
  name: string,
  fields: { powerW: number; durationS: number; energyWh: number; starts: number[] },
  costCents: number | null,
) {
  const group = {
    powerW: fields.powerW,
    durationS: fields.durationS,
    energyWh: fields.energyWh,
    count: fields.starts.length,
    cycles: fields.starts.map((start) => ({ start }) as Cycle),
  } as CycleGroup;
  return { name, group, costCents };
}

const stove = row('stove', { powerW: 2160, durationS: 748, energyWh: 211, starts: [1000] }, 2);
const standby = row('standby', { powerW: 33, durationS: 8, energyWh: 210, starts: [500, 900] }, 3);
const cooker = row('cooker', { powerW: 185, durationS: 9000, energyWh: 480, starts: [800] }, 5);
const rows = [stove, standby, cooker];
const names = (list: typeof rows) => list.map((item) => item.name);

describe('sortGroups', () => {
  it('puts the dearest first by default', () => {
    expect(names(sortGroups(rows, 'cost'))).toEqual(['cooker', 'standby', 'stove']);
  });

  it('falls back on energy without a tariff, and between equal costs', () => {
    const free = rows.map((item) => ({ ...item, costCents: null }));
    expect(names(sortGroups(free, 'cost'))).toEqual(['cooker', 'stove', 'standby']);
    const same = rows.map((item) => ({ ...item, costCents: 1 }));
    expect(names(sortGroups(same, 'cost'))).toEqual(['cooker', 'stove', 'standby']);
  });

  it('orders by the first time of the day, whatever came later', () => {
    expect(names(sortGroups(rows, 'time'))).toEqual(['standby', 'cooker', 'stove']);
  });

  it('orders by power, which is not the cost', () => {
    expect(names(sortGroups(rows, 'power'))).toEqual(['stove', 'cooker', 'standby']);
  });

  it('orders by the duration the card shows, the longest first', () => {
    expect(names(sortGroups(rows, 'duration'))).toEqual(['cooker', 'stove', 'standby']);
  });

  it('leaves the list it was given as it was', () => {
    const list = [...rows];
    sortGroups(list, 'time');
    expect(names(list)).toEqual(['stove', 'standby', 'cooker']);
  });
});

describe('parseGroupOrder', () => {
  it('keeps a known order and turns anything else into the default', () => {
    expect(parseGroupOrder('time')).toBe('time');
    expect(parseGroupOrder('rubbish')).toBe('cost');
    expect(parseGroupOrder(null)).toBe('cost');
  });
});
