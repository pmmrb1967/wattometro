// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { logMinutes, toIngestMinutes, type LogData } from './backfill';

// As EM1Data.GetData answers (keys as on the EM Gen3, firmware 2.1.0); synthetic values.
const KEYS = [
  'total_act_energy',
  'total_act_ret_energy',
  'lag_react_energy',
  'lead_react_energy',
  'max_act_power',
  'min_act_power',
  'max_aprt_power',
  'min_aprt_power',
  'max_voltage',
  'min_voltage',
  'avg_voltage',
  'max_current',
  'min_current',
  'avg_current',
];
const T = 1_792_000_020 - (1_792_000_020 % 60);
/** A minute of `wh` Wh at ~227 V. */
const row = (wh: number, current = 1.7) => [
  wh,
  0,
  0,
  3.1,
  330,
  260,
  430,
  370,
  228.6,
  226.3,
  227.3,
  1.9,
  1.6,
  current,
];

describe('the Shelly minute log', () => {
  it('carries the Wh decimals so the whole Wh add up', () => {
    const answer: LogData = {
      keys: KEYS,
      data: [{ ts: T, period: 60, values: [row(4.9), row(4.9), row(4.9)] }],
    };
    const minutes = toIngestMinutes(logMinutes(answer, T, T + 180), 0);
    // 4,9 → 9,8 → 14,7: floors 4, 9, 14.
    expect(minutes.map((m) => m.e)).toEqual([4, 5, 5]);
    expect(minutes[0]).toEqual({
      t: T,
      c: 0,
      n: 60,
      e: 4,
      // 4,9 Wh in a minute is 294 W on average.
      pa: 294,
      pn: 260,
      px: 330,
      va: 2273,
      vn: 2263,
      vx: 2286,
      // 294 / (227,3 × 1,7) = 0,761.
      pf: 76,
      sx: 430,
    });
  });

  it('starts the carry again after a gap, and skips what is out of range or incomplete', () => {
    const answer: LogData = {
      keys: KEYS,
      data: [
        { ts: T, period: 60, values: [row(0.6), row(0.6)] },
        { ts: T + 600, period: 60, values: [row(0.6), [null, ...row(0).slice(1)]] },
        { ts: T + 3600, period: 60, values: [row(9)] },
      ],
    };
    const minutes = toIngestMinutes(logMinutes(answer, T, T + 3600), 1);
    expect(minutes.map((m) => [m.t - T, m.e, m.c])).toEqual([
      [0, 0, 1],
      [60, 1, 1],
      [600, 0, 1],
    ]);
  });

  it('sends pf 100 without current, and keeps pa within the minimum and maximum', () => {
    const idle = [0, 0, 0, 0, 0, 0, 4.6, 4.6, 228.3, 227.9, 228.1, 0, 0, 0];
    const answer: LogData = { keys: KEYS, data: [{ ts: T, period: 60, values: [idle, row(6)] }] };
    const [first, second] = toIngestMinutes(logMinutes(answer, T, T + 120), 1);
    expect(first).toMatchObject({ e: 0, pa: 0, pn: 0, px: 0, pf: 100, sx: 5 });
    // 6 Wh is 360 W on average, above the logged maximum of 330 W.
    expect(second).toMatchObject({ pa: 360, px: 360 });
  });

  it('refuses a log without the keys it needs', () => {
    expect(() => logMinutes({ keys: ['total_act_energy'], data: [] }, T, T + 60)).toThrow();
  });
});
