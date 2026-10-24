// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HOUR, startOfLisbonDay } from '../lib/time';
import {
  climateNormal,
  dailyMeans,
  demoHours,
  loadHourlyTemperature,
  parseHourly,
  utcMonths,
  type HourTemperature,
} from './weather';

/** Every hour of [from, to) at a value given by its index. */
function hours(from: number, to: number, value: (index: number) => number | null) {
  const list: HourTemperature[] = [];
  for (let ts = from, index = 0; ts < to; ts += HOUR, index++) list.push([ts, value(index)]);
  return list;
}

describe('parseHourly', () => {
  it('reads unixtime hours and keeps tenths of a degree', () => {
    expect(
      parseHourly({
        latitude: 40.17,
        hourly_units: { time: 'unixtime', temperature_2m: '°C' },
        hourly: { time: [1792022400, 1792026000, 1792029600], temperature_2m: [16.4, null, -0.3] },
      }),
    ).toEqual([
      [1792022400, 164],
      [1792026000, null],
      [1792029600, -3],
    ]);
  });

  it('rejects malformed answers', () => {
    expect(parseHourly({ error: true, reason: 'x' })).toBeNull();
    expect(parseHourly({ hourly: { time: [1, 2], temperature_2m: [1] } })).toBeNull();
    expect(parseHourly({ hourly: { time: ['2026-10-01T00:00'], temperature_2m: [1] } })).toBeNull();
  });
});

describe('dailyMeans', () => {
  it('averages the hours of each Lisbon day (not UTC)', () => {
    // 2026-07-01 in Lisbon is UTC+1: its day starts at 23:00 UTC of the day before.
    const start = startOfLisbonDay('2026-07-01');
    const end = startOfLisbonDay('2026-07-02');
    // 0 to 23 tenths → mean 11.5 → 12 (rounded); the next day's first hour at 1000 does not count.
    const list = [...hours(start, end, (index) => index), [end, 1000] as HourTemperature];
    expect(dailyMeans(list)).toEqual(new Map([['2026-07-01', 12]]));
  });

  it('25 h day: all 25 hours count; too few hours: no mean', () => {
    const start = startOfLisbonDay('2026-10-25');
    const end = startOfLisbonDay('2026-10-26');
    expect((end - start) / HOUR).toBe(25);
    expect(dailyMeans(hours(start, end, (index) => (index === 24 ? 250 : 0)))).toEqual(
      new Map([['2026-10-25', 10]]),
    );
    // 19 hours with a value: below MIN_HOURS_PER_DAY.
    expect(dailyMeans(hours(start, end, (index) => (index < 19 ? 100 : null)))).toEqual(new Map());
  });
});

describe('climateNormal', () => {
  it('mean of the same time of year (±7 days) over the years given', () => {
    const daily = new Map([
      ['2024-01-10', 80],
      ['2025-01-14', 100],
      ['2025-01-20', 300], // 10 days away from 10 January: outside the window
      ['2025-07-10', 250],
    ]);
    const normal = climateNormal(daily);
    expect(normal('2026-01-10')).toBe(90);
    expect(normal('2026-07-12')).toBe(250);
    expect(normal('2026-04-01')).toBeNull();
  });

  it('wraps around the new year', () => {
    const normal = climateNormal(new Map([['2025-12-29', 60]]));
    expect(normal('2026-01-02')).toBe(60);
  });
});

describe('utcMonths', () => {
  it('the UTC months that overlap a range, across a year end', () => {
    const from = Date.UTC(2025, 11, 20) / 1000;
    const to = Date.UTC(2026, 1, 1) / 1000 + 1;
    expect(utcMonths(from, to).map(([key]) => key)).toEqual(['2025-12', '2026-01', '2026-02']);
    expect(utcMonths(from, to)[1]).toEqual([
      '2026-01',
      Date.UTC(2026, 0, 1) / 1000,
      Date.UTC(2026, 1, 1) / 1000,
    ]);
  });
});

describe('demoHours', () => {
  it('a mild winter and a warm summer, hour by hour', () => {
    const winter = dailyMeans(
      demoHours(startOfLisbonDay('2026-01-15'), startOfLisbonDay('2026-01-16')),
    );
    const summer = dailyMeans(
      demoHours(startOfLisbonDay('2026-07-15'), startOfLisbonDay('2026-07-16')),
    );
    expect(winter.get('2026-01-15')).toBeLessThan(150);
    expect(summer.get('2026-07-15')).toBeGreaterThan(200);
  });
});

describe('loadHourlyTemperature', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const COIMBRA = { latitudeCdeg: 4021, longitudeCdeg: -842 };

  it('archive where it has values, forecast for the rest; rounded coordinates', async () => {
    const now = Date.UTC(2026, 9, 24, 12) / 1000;
    vi.useFakeTimers({ now: now * 1000, toFake: ['Date'] });
    const from = Date.UTC(2026, 9, 22) / 1000;
    const to = Date.UTC(2026, 9, 26) / 1000;
    const urls: URL[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn<(url: string) => Promise<Response>>((url) => {
        const parsed = new URL(url);
        urls.push(parsed);
        const archive = parsed.hostname.startsWith('archive');
        // Archive: 10.0 °C up to the end of 23 October; forecast: 20.0 °C everywhere.
        const list = archive
          ? hours(Date.UTC(2026, 9, 1) / 1000, Date.UTC(2026, 9, 24) / 1000, () => 10)
          : hours(Date.UTC(2026, 9, 14) / 1000, Date.UTC(2026, 10, 9) / 1000, () => 20);
        return Promise.resolve(
          Response.json({
            hourly: {
              time: list.map(([ts]) => ts),
              temperature_2m: list.map(([, value]) => value),
            },
          }),
        );
      }),
    );
    const result = await loadHourlyTemperature(COIMBRA, from, to);
    expect(result).toHaveLength(4 * 24);
    expect(result?.[0]).toEqual([from, 100]);
    expect(result?.find(([ts]) => ts === Date.UTC(2026, 9, 23, 23) / 1000)?.[1]).toBe(100);
    expect(result?.find(([ts]) => ts === Date.UTC(2026, 9, 24) / 1000)?.[1]).toBe(200);
    const archive = urls.find((url) => url.hostname.startsWith('archive'));
    expect(archive?.searchParams.get('latitude')).toBe('40.21');
    expect(archive?.searchParams.get('longitude')).toBe('-8.42');
    expect(archive?.searchParams.get('start_date')).toBe('2026-10-01');
    expect(archive?.searchParams.get('end_date')).toBe('2026-10-23');
  });

  it('null when nothing could be fetched', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );
    // Another locality: the forecast of the test above is kept in memory.
    expect(await loadHourlyTemperature({ latitudeCdeg: 3702, longitudeCdeg: -793 }, 0, HOUR)).toBe(
      null,
    );
  });
});
