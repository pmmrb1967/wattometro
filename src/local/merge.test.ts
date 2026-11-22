// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { emptyLocalData, type LocalData, type LocalQuarter } from './data';
import { mergeHouses, type HouseSnapshot } from './merge';
import { emptyMeta, type Section } from './meta';

const DAY = 86_400;
const T0 = 1_700_000_100; // multiple of 900
const NOW = 1_800_000_000;

function snap(
  deviceId: string,
  patch: Partial<LocalData> = {},
  stamps: Partial<Record<Section, number>> = {},
  generation = { id: '', at: 0 },
): HouseSnapshot {
  const meta = emptyMeta();
  return {
    deviceId,
    data: { ...emptyLocalData(), ...patch },
    meta: { stamps: { ...meta.stamps, ...stamps }, quartersGeneration: generation },
  };
}

const tariff = (id: string, validFrom: string): LocalData['tariffs'][number] =>
  ({ id, validFrom }) as unknown as LocalData['tariffs'][number];

describe('mergeHouses', () => {
  it('unions quarters of two devices', () => {
    const a = snap('a', { quarters: [[T0, 100, 0]] }, { quarters: 5 });
    const b = snap('b', { quarters: [[T0 + 900, 200, 0]] }, { quarters: 6 });
    const { data } = mergeHouses(a, [b], NOW);
    expect(data.quarters).toEqual([
      [T0, 100, 0],
      [T0 + 900, 200, 0],
    ]);
  });

  it('same quarter: the newer quarters stamp wins', () => {
    const a = snap('a', { quarters: [[T0, 100, 0]] }, { quarters: 5 });
    const b = snap('b', { quarters: [[T0, 300, 1]] }, { quarters: 9 });
    expect(mergeHouses(a, [b], NOW).data.quarters).toEqual([[T0, 300, 1]]);
    expect(mergeHouses(b, [a], NOW).data.quarters).toEqual([[T0, 300, 1]]);
  });

  it('same quarter, same stamp: the larger deviceId wins', () => {
    const a = snap('a', { quarters: [[T0, 100, 0]] }, { quarters: 5 });
    const b = snap('b', { quarters: [[T0, 300, 0]] }, { quarters: 5 });
    expect(mergeHouses(a, [b], NOW).data.quarters).toEqual([[T0, 300, 0]]);
  });

  it('newer section wins whole', () => {
    const a = snap(
      'a',
      { tariffs: [tariff('1', '2026-01-01'), tariff('2', '2026-02-01')] },
      { tariffs: 10 },
    );
    const b = snap('b', { tariffs: [tariff('3', '2026-03-01')] }, { tariffs: 20 });
    const merged = mergeHouses(a, [b], NOW);
    expect(merged.data.tariffs).toEqual(b.data.tariffs);
    expect(merged.meta.stamps.tariffs).toBe(20);
  });

  it('a stamp of 0 loses to any stamp', () => {
    const a = snap('z', { zone: 'A' }, { zone: 0 });
    const b = snap('a', { zone: 'B' }, { zone: 1 });
    expect(mergeHouses(a, [b], NOW).data.zone).toBe('B');
  });

  it('tie on equal non-zero stamps goes to the larger deviceId', () => {
    const a = snap('a', { zone: 'A' }, { zone: 7 });
    const b = snap('b', { zone: 'B' }, { zone: 7 });
    expect(mergeHouses(a, [b], NOW).data.zone).toBe('B');
    expect(mergeHouses(b, [a], NOW).data.zone).toBe('B');
  });

  it('deleting a tariff propagates', () => {
    const a = snap('a', { tariffs: [] }, { tariffs: 30 });
    const b = snap('b', { tariffs: [tariff('1', '2026-01-01')] }, { tariffs: 20 });
    expect(mergeHouses(b, [a], NOW).data.tariffs).toEqual([]);
  });

  it('a newer quarters generation drops the older quarters', () => {
    const a = snap('a', { quarters: [[T0, 100, 0]] }, { quarters: 99 }, { id: 'g0', at: 0 });
    const b = snap('b', { quarters: [[T0 + 900, 200, 0]] }, { quarters: 51 }, { id: 'g1', at: 50 });
    const merged = mergeHouses(a, [b], NOW);
    expect(merged.data.quarters).toEqual([[T0 + 900, 200, 0]]);
    expect(merged.meta.quartersGeneration).toEqual({ id: 'g1', at: 50 });
    expect(merged.meta.stamps.quarters).toBe(51);
  });

  it('equipment and alwaysOn come from the same snapshot', () => {
    const a = snap(
      'a',
      { equipment: [{ name: 'A' }] as unknown as LocalData['equipment'], alwaysOn: [] },
      { equipment: 20 },
    );
    const b = snap(
      'b',
      { equipment: [], alwaysOn: [{ name: 'B' }] as unknown as LocalData['alwaysOn'] },
      { equipment: 10 },
    );
    const { data } = mergeHouses(b, [a], NOW);
    expect(data.equipment).toEqual(a.data.equipment);
    expect(data.alwaysOn).toEqual(a.data.alwaysOn);
  });

  it('a stamp more than a day ahead counts as now', () => {
    const a = snap('a', { zone: 'A' }, { zone: NOW + 10 * DAY });
    const b = snap('b', { zone: 'B' }, { zone: NOW - 5 });
    const merged = mergeHouses(b, [a], NOW);
    expect(merged.data.zone).toBe('A');
    expect(merged.meta.stamps.zone).toBe(NOW);
    // a later real change beats the capped one only once it is really later
    const c = snap('c', { zone: 'C' }, { zone: NOW });
    expect(mergeHouses(a, [c], NOW).data.zone).toBe('C');
  });

  it('order of theirs does not change the result', () => {
    const quarter = (n: number, wh: number): LocalQuarter => [T0 + 900 * n, wh, 0];
    const a = snap(
      'a',
      { quarters: [quarter(0, 1), quarter(1, 2)], zone: 'A' },
      { quarters: 3, zone: 4 },
    );
    const b = snap('b', { quarters: [quarter(1, 9)], zone: 'B' }, { quarters: 5, zone: 4 });
    const c = snap('c', { quarters: [quarter(2, 7)], zone: 'C' }, { quarters: 5, zone: 2 });
    const all = [a, b, c];
    const expected = mergeHouses(a, [b, c], NOW);
    for (const [mine, ...rest] of [
      [a, c, b],
      [b, a, c],
      [b, c, a],
      [c, a, b],
      [c, b, a],
    ]) {
      expect(mergeHouses(mine!, rest, NOW)).toEqual(expected);
    }
    expect(all.length).toBe(3);
  });
});
