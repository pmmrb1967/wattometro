// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { easterSunday, holidays, isHoliday } from './holidays';

describe('easterSunday', () => {
  it('matches the known dates (docs/holidays.md)', () => {
    expect(easterSunday(2024)).toBe('2024-03-31');
    expect(easterSunday(2025)).toBe('2025-04-20');
    expect(easterSunday(2026)).toBe('2026-04-05');
    expect(easterSunday(2027)).toBe('2027-03-28');
  });
});

describe('holidays', () => {
  it('2026: 13 mandatory holidays, with Good Friday and Corpus Christi from Easter', () => {
    expect(holidays(2026)).toEqual([
      '2026-01-01',
      '2026-04-03', // Good Friday
      '2026-04-05', // Easter Sunday
      '2026-04-25',
      '2026-05-01',
      '2026-06-04', // Corpus Christi, a Thursday
      '2026-06-10',
      '2026-08-15',
      '2026-10-05',
      '2026-11-01',
      '2026-12-01',
      '2026-12-08',
      '2026-12-25',
    ]);
  });

  it('2014: Corpus Christi, 5 Oct, 1 Nov and 1 Dec were suspended', () => {
    const list = holidays(2014);
    expect(list).toHaveLength(9);
    expect(list).not.toContain('2014-10-05');
    expect(list).not.toContain('2014-06-19'); // Easter 2014-04-20 + 60
  });

  it('2016: restored on 2 April, so Corpus Christi (26 May) counts', () => {
    expect(holidays(2016)).toContain('2016-05-26');
    expect(holidays(2016)).toContain('2016-12-01');
  });
});

describe('isHoliday', () => {
  it('holidays and ordinary days', () => {
    expect(isHoliday('2025-04-18')).toBe(true); // Good Friday
    expect(isHoliday('2025-06-19')).toBe(true); // Corpus Christi
    expect(isHoliday('2025-06-13')).toBe(false); // Lisbon's municipal holiday: optional
    expect(isHoliday('2025-02-04')).toBe(false);
  });
});
