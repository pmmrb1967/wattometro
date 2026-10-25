// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, it } from 'vitest';
import { lisbonLocalTime, nextDate } from '../lib/time';
import { FIRST_TRY_S, GIVE_UP_S, nextTry, RETRY_S, runFromTimes } from './calibration';

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
