// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { nextDate, startOfLisbonDay, type LocalDate } from '../lib/time';
import { daySums, mergeQuarters, staleRanges } from './energy-cache';

function day(date: LocalDate, wh: number) {
  const quarters = [];
  for (let ts = startOfLisbonDay(date); ts < startOfLisbonDay(nextDate(date)); ts += 900) {
    quarters.push({ ts, energyWh: wh });
  }
  return quarters;
}

describe('daySums', () => {
  it('Lisbon days, including the 25 h one', () => {
    const sums = daySums([
      ...day('2026-10-24', 1),
      ...day('2026-10-25', 1),
      ...day('2026-10-26', 2),
    ]);
    expect([...sums]).toEqual([
      ['2026-10-24', 96],
      ['2026-10-25', 100],
      ['2026-10-26', 192],
    ]);
  });
});

describe('staleRanges', () => {
  const kept = new Map([
    ['2026-05-01', 100],
    ['2026-05-02', 100],
    ['2026-05-03', 100],
    ['2026-05-05', 100],
  ]);

  it('nothing when every day matches', () => {
    expect(
      staleRanges(kept, [
        ['2026-05-01', 100],
        ['2026-05-02', 100],
      ]),
    ).toEqual([]);
  });

  it('days missing or different, consecutive ones together', () => {
    expect(
      staleRanges(kept, [
        ['2026-05-01', 100],
        ['2026-05-02', 120], // changed (a new import)
        ['2026-05-03', 130],
        ['2026-05-05', 100],
        // A day without data on the server (05-06) does not split a range.
        ['2026-05-07', 50], // new
        ['2026-05-08', 60],
      ]),
    ).toEqual([
      ['2026-05-02', '2026-05-03'],
      ['2026-05-07', '2026-05-08'],
    ]);
  });

  it('many ranges: one from the first to the last', () => {
    // 20 days; the odd ones match, the even ones differ: 10 separate ranges.
    const date = (index: number) => `2026-06-${String(index).padStart(2, '0')}`;
    const same = new Map<LocalDate, number>();
    const server: [LocalDate, number][] = [];
    for (let index = 1; index <= 20; index++) {
      if (index % 2 === 1) same.set(date(index), 5);
      server.push([date(index), 5]);
    }
    expect(staleRanges(same, server)).toEqual([['2026-06-02', '2026-06-20']]);
  });
});

describe('mergeQuarters', () => {
  it('replaces fetched days, drops days the server no longer has and those out of range', () => {
    const kept = [...day('2026-05-01', 1), ...day('2026-05-02', 1), ...day('2026-05-03', 1)];
    const from = startOfLisbonDay('2026-05-02');
    const to = startOfLisbonDay('2026-05-05');
    const fetched = {
      from: startOfLisbonDay('2026-05-03'),
      to: startOfLisbonDay('2026-05-05'),
      quarters: [...day('2026-05-03', 2), ...day('2026-05-04', 3)],
    };
    const merged = mergeQuarters(kept, new Set(['2026-05-03', '2026-05-04']), [fetched], from, to);
    // 05-01: out of range; 05-02: gone from the server; 05-03 and 05-04: as fetched.
    expect([...daySums(merged)]).toEqual([
      ['2026-05-03', 192],
      ['2026-05-04', 288],
    ]);
    expect(merged.map(({ ts }) => ts)).toEqual(
      [...merged.map(({ ts }) => ts)].sort((a, b) => a - b),
    );
  });
});
