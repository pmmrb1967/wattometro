// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  floorTo,
  formatDuration,
  formatLisbonDateTime,
  formatLocalDate,
  formatLisbonTime,
  HOUR,
  lisbonDate,
  lisbonDayLength,
  lisbonOffset,
  lisbonParts,
  nextDate,
  QUARTER_HOUR,
  startOfLisbonDay,
} from './time';

const at = (iso: string) => Date.parse(iso) / 1000;

describe('lisbonParts', () => {
  it('uses WET (UTC+0) in winter and WEST (UTC+1) in summer', () => {
    expect(lisbonParts(at('2026-01-15T12:00:00Z'))).toMatchObject({ hour: 12, weekday: 4 });
    expect(lisbonParts(at('2026-07-15T12:00:00Z'))).toMatchObject({ hour: 13, weekday: 3 });
  });

  it('jumps from 01:00 to 02:00 on 2026-03-29 (23-hour day)', () => {
    expect(lisbonParts(at('2026-03-29T00:59:00Z'))).toMatchObject({ hour: 0, minute: 59 });
    expect(lisbonParts(at('2026-03-29T01:00:00Z'))).toMatchObject({ hour: 2, minute: 0 });
  });

  it('repeats 01:00–02:00 on 2026-10-25 (25-hour day)', () => {
    expect(lisbonParts(at('2026-10-25T00:30:00Z'))).toMatchObject({ hour: 1, minute: 30 });
    expect(lisbonParts(at('2026-10-25T01:30:00Z'))).toMatchObject({ hour: 1, minute: 30 });
  });
});

describe('lisbonDate', () => {
  it('changes day at local midnight, not UTC midnight', () => {
    expect(lisbonDate(at('2026-07-15T22:59:59Z'))).toBe('2026-07-15');
    expect(lisbonDate(at('2026-07-15T23:00:00Z'))).toBe('2026-07-16');
    expect(lisbonDate(at('2026-01-15T23:59:59Z'))).toBe('2026-01-15');
  });
});

describe('lisbonOffset', () => {
  it('is 0 in winter and one hour in summer', () => {
    expect(lisbonOffset(at('2026-01-15T12:00:30Z'))).toBe(0);
    expect(lisbonOffset(at('2026-07-15T12:00:30Z'))).toBe(HOUR);
  });
});

describe('startOfLisbonDay and lisbonDayLength', () => {
  it.each([
    ['2026-01-15', '2026-01-15T00:00:00Z', 24],
    ['2026-07-15', '2026-07-14T23:00:00Z', 24],
    ['2026-03-29', '2026-03-29T00:00:00Z', 23],
    ['2026-03-30', '2026-03-29T23:00:00Z', 24],
    ['2026-10-25', '2026-10-24T23:00:00Z', 25],
    ['2026-10-26', '2026-10-26T00:00:00Z', 24],
  ])('%s starts at %s and lasts %i h', (date, start, hours) => {
    expect(startOfLisbonDay(date)).toBe(at(start));
    expect(lisbonDayLength(date)).toBe(hours * HOUR);
  });

  it('has 92, 96 and 100 quarter-hours on short, normal and long days', () => {
    expect(lisbonDayLength('2026-03-29') / QUARTER_HOUR).toBe(92);
    expect(lisbonDayLength('2026-06-01') / QUARTER_HOUR).toBe(96);
    expect(lisbonDayLength('2026-10-25') / QUARTER_HOUR).toBe(100);
  });

  it('round-trips with lisbonDate on every day of a year', () => {
    let date = '2026-01-01';
    while (date !== '2027-01-01') {
      expect(lisbonDate(startOfLisbonDay(date))).toBe(date);
      expect(lisbonDate(startOfLisbonDay(date) - 1)).not.toBe(date);
      date = nextDate(date);
    }
  });

  it('rejects malformed dates', () => {
    expect(() => startOfLisbonDay('2026-1-5')).toThrow(RangeError);
  });
});

describe('nextDate', () => {
  it('crosses months and years', () => {
    expect(nextDate('2026-02-28')).toBe('2026-03-01');
    expect(nextDate('2028-02-28')).toBe('2028-02-29');
    expect(nextDate('2026-12-31')).toBe('2027-01-01');
  });
});

describe('floorTo', () => {
  it('aligns to quarter-hours, also across the clock change', () => {
    expect(floorTo(at('2026-10-25T01:14:59Z'), QUARTER_HOUR)).toBe(at('2026-10-25T01:00:00Z'));
    expect(floorTo(at('2026-10-25T01:15:00Z'), QUARTER_HOUR)).toBe(at('2026-10-25T01:15:00Z'));
  });

  it('rejects intervals that do not divide an hour', () => {
    expect(() => floorTo(0, 7 * 60)).toThrow(RangeError);
  });
});

describe('formatLisbonDateTime', () => {
  it('shows Lisbon time, including both 01:30 of the 25-hour day', () => {
    expect(formatLisbonDateTime(at('2026-07-05T08:07:00Z'))).toBe('05/07/2026 09:07');
    expect(formatLisbonDateTime(at('2026-10-25T00:30:00Z'))).toBe('25/10/2026 01:30');
    expect(formatLisbonDateTime(at('2026-10-25T01:30:00Z'))).toBe('25/10/2026 01:30');
  });
});

describe('formatLisbonTime', () => {
  it('shows the Lisbon hour and minute', () => {
    expect(formatLisbonTime(at('2026-01-15T08:05:00Z'))).toBe('08:05');
    expect(formatLisbonTime(at('2026-07-15T23:30:00Z'))).toBe('00:30');
  });
});

describe('formatLocalDate', () => {
  it('shows a day as DD/MM/YYYY', () => {
    expect(formatLocalDate('2026-03-09')).toBe('09/03/2026');
    expect(() => formatLocalDate('9/3/2026')).toThrow(RangeError);
  });
});

describe('formatDuration', () => {
  it('seconds, minutes and hours', () => {
    expect(formatDuration(45)).toBe('45 s');
    expect(formatDuration(180)).toBe('3 min');
    expect(formatDuration(200)).toBe('3 min 20 s');
    expect(formatDuration(7500)).toBe('2 h 05 min');
    expect(formatDuration(7199)).toBe('1 h 59 min');
  });
});
