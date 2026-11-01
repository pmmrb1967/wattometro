// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, it } from 'vitest';
import { lisbonLocalTime, nextDate } from '../lib/time';
import {
  endFromTime,
  FIRST_TRY_S,
  GIVE_UP_S,
  MAX_RUN_S,
  nextTry,
  RETRY_S,
  runFromTimes,
} from './calibration';

const pending = { meter: 'd:0', label: 'Chaleira', from: 1000, to: 1200 };

it('waits for the Shelly to send the last minute, then tries every minute', () => {
  expect(nextTry({ ...pending, to: null }, null, 5000)).toBeNull();
  expect(nextTry(pending, null, 1200 + FIRST_TRY_S - 1)).toBe('wait');
  expect(nextTry(pending, null, 1200 + FIRST_TRY_S)).toBe('now');
  const tried = 1200 + FIRST_TRY_S;
  expect(nextTry(pending, tried, tried + RETRY_S - 1)).toBe('wait');
  expect(nextTry(pending, tried, tried + RETRY_S)).toBe('now');
  expect(nextTry(pending, tried, 1200 + GIVE_UP_S)).toBe('late');
});

it('tries once a run that ended long ago, and only then gives up', () => {
  const long = 1200 + GIVE_UP_S + 3600;
  expect(nextTry(pending, null, long)).toBe('now');
  expect(nextTry(pending, long, long + 1)).toBe('late');
});

it('reads a forgotten end as the first such time after the start', () => {
  const day = '2026-10-21';
  const from = (lisbonLocalTime(day, 9, 14) as number) + 40;
  const later = lisbonLocalTime(day, 20, 0) as number;
  expect(endFromTime(from, '09:15', later)).toBe(lisbonLocalTime(day, 9, 15));
  // Not reached yet.
  expect(endFromTime(from, '10:00', from + 60)).toBeNull();
  // Before the start it is the next day, too long a run.
  expect(endFromTime(from, '09:00', later + 86_400)).toBeNull();
  expect(endFromTime(from, 'x', later)).toBeNull();

  const late = lisbonLocalTime(day, 23, 50) as number;
  const midnight = lisbonLocalTime('2026-10-22', 0, 10) as number;
  expect(endFromTime(late, '00:10', midnight)).toBe(midnight);

  const start = lisbonLocalTime(day, 8, 0) as number;
  expect(endFromTime(start, '12:00', later)).toBe(start + MAX_RUN_S);
  expect(endFromTime(start, '12:01', later)).toBeNull();
});

it('reads a run from Lisbon times, past midnight on the next day', () => {
  const day = '2026-10-21';
  const at = (h: number, m: number) => lisbonLocalTime(day, h, m) as number;
  expect(runFromTimes(day, '07:42', '07:45', lisbonLocalTime, nextDate)).toEqual({
    from: at(7, 42),
    to: at(7, 45),
  });
  expect(runFromTimes(day, '23:50', '00:20', lisbonLocalTime, nextDate)).toEqual({
    from: at(23, 50),
    to: lisbonLocalTime('2026-10-22', 0, 20) as number,
  });
  expect(runFromTimes(day, '7:42', '07:45', lisbonLocalTime, nextDate)).toBeNull();
  // 01:30 does not exist on the last Sunday of March.
  expect(runFromTimes('2027-03-28', '01:30', '02:30', lisbonLocalTime, nextDate)).toBeNull();
});
