// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { startOfLisbonDay } from '../lib/time';
import { monthPeaks, seasonWarning } from './power-year';

// 10:00 in Lisbon on a day.
const at = (day: string) => startOfLisbonDay(day) + 10 * 3600;

describe('monthPeaks', () => {
  it('takes the highest second of the Shelly and the highest quarter of each source', () => {
    const rows = monthPeaks(
      ['2026-01', '2026-09', '2026-10'],
      [
        { day: '2026-10-02', peak: 5200, estimated: false },
        { day: '2026-10-20', peak: 7400, estimated: false },
        { day: '2026-10-21', peak: 6000, estimated: true },
      ],
      [
        { ts: at('2026-01-10'), energyWh: 1500 },
        { ts: at('2026-01-11'), energyWh: 1800 },
        { ts: at('2026-10-02'), energyWh: 900 },
      ],
      [{ ts: at('2026-10-20'), energyWh: 1000 }],
    );
    expect(rows).toEqual([
      { month: '2026-01', shelly: null, eredesW: 7200, quarterW: 7200 },
      { month: '2026-09', shelly: null, eredesW: null, quarterW: null },
      {
        month: '2026-10',
        shelly: { peak: 7400, estimated: true },
        eredesW: 3600,
        quarterW: 4000,
      },
    ]);
  });

  it('counts a quarter in its Lisbon month', () => {
    // 23:30 on 31/7 in Lisbon (22:30 UTC): still July.
    const july = startOfLisbonDay('2026-07-31') + 23.5 * 3600;
    const rows = monthPeaks(['2026-07', '2026-08'], [], [{ ts: july, energyWh: 500 }], []);
    expect(rows.map((row) => row.eredesW)).toEqual([2000, null]);
  });
});

describe('seasonWarning', () => {
  const shelly = { peak: 7000, estimated: false };

  it('warns about the month without the Shelly furthest above the measured ones', () => {
    expect(
      seasonWarning([
        { month: '2026-01', shelly: null, eredesW: 6000, quarterW: 6000 },
        { month: '2026-02', shelly: null, eredesW: 4500, quarterW: 4500 },
        { month: '2026-10', shelly, eredesW: null, quarterW: 4000 },
      ]),
    ).toEqual({ month: '2026-01', eredesW: 6000, measuredW: 4000 });
  });

  it('keeps quiet under the margin, or without months of both kinds', () => {
    // 4390 W is under 4000 W + 10 %.
    expect(
      seasonWarning([
        { month: '2026-01', shelly: null, eredesW: 4390, quarterW: 4390 },
        { month: '2026-10', shelly, eredesW: null, quarterW: 4000 },
      ]),
    ).toBeNull();
    expect(
      seasonWarning([{ month: '2026-01', shelly: null, eredesW: 9000, quarterW: 9000 }]),
    ).toBeNull();
  });
});
