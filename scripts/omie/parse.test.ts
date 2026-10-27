// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { omiePrice } from '../../src/domain/omie';
import { startOfLisbonDay } from '../../src/lib/time';
import { joinDays, parseOmieDay } from './parse';

// Synthetic files in the OMIE format (docs/omie.md): CET periods, € per MWh.
const file = (date: string, prices: number[]) =>
  [
    'MARGINALPDBCPT;',
    ...prices.map((price, index) => `${date.replaceAll('-', ';')};${index + 1};${price};${price};`),
    '*',
  ].join('\r\n');

const meta = { source: 'test', fetchedAt: '2026-10-27T00:00:00Z' };

describe('parseOmieDay', () => {
  it('reads the Portuguese price of each quarter hour in cents per MWh', () => {
    const day = parseOmieDay(file('2026-10-27', Array.from({ length: 96 }, (_, i) => i + 0.5)));
    expect(day.date).toBe('2026-10-27');
    expect(day.step).toBe(900);
    expect(day.prices.slice(0, 3)).toEqual([50, 150, 250]);
  });

  it('reads hourly days (before October 2025), including a 23-hour one', () => {
    const day = parseOmieDay(file('2025-03-30', Array.from({ length: 23 }, () => -1.5)));
    expect(day.step).toBe(3600);
    expect(day.prices).toHaveLength(23);
    expect(day.prices[0]).toBe(-150);
  });

  it('rejects what is not a price file', () => {
    expect(() => parseOmieDay('<!DOCTYPE html>')).toThrow();
    expect(() => parseOmieDay(file('2026-10-27', [1, 2, 3]))).toThrow(/3 periods/);
  });
});

describe('joinDays', () => {
  it('a series of quarter hours from 00:00 in Madrid (23:00 in Lisbon the day before)', () => {
    const omie = joinDays(
      [parseOmieDay(file('2026-01-06', Array.from({ length: 96 }, () => 20)))],
      meta,
    );
    // 06/01 00:00 in Madrid is 05/01 23:00 in Lisbon (winter, UTC+0).
    expect(omie.start).toBe(startOfLisbonDay('2026-01-06') - 3600);
    expect(omiePrice(omie, startOfLisbonDay('2026-01-06'))).toBe(2000);
  });

  it('repeats an hourly price in its four quarters, and leaves a missing day empty', () => {
    const omie = joinDays(
      [
        parseOmieDay(file('2025-03-30', Array.from({ length: 23 }, (_, i) => i))),
        parseOmieDay(file('2025-04-01', Array.from({ length: 24 }, () => 7))),
      ],
      meta,
    );
    expect(omie.prices.slice(0, 5)).toEqual([0, 0, 0, 0, 100]);
    // 92 quarters on 30/03, 96 missing on 31/03, then 01/04.
    expect(omie.prices.slice(92, 188).every((price) => price === null)).toBe(true);
    expect(omie.prices[188]).toBe(700);
    expect(omie.prices).toHaveLength(92 + 96 + 96);
  });
});
