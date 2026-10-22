// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  mondayOf,
  outagesFromBoots,
  VOLTAGE_LIMITS,
  voltageEpisodes,
  weeklyCompliance,
  yearSummary,
} from './voltage';

const at = (iso: string) => Date.parse(iso) / 1000;

describe('limits (docs/voltage.md)', () => {
  it('230 V ± 10 % and − 15 %', () => {
    expect(VOLTAGE_LIMITS).toMatchObject({ lowDv: 2070, highDv: 2530, floorDv: 1955 });
  });
});

describe('voltageEpisodes', () => {
  const t0 = at('2026-07-15T09:00:00Z');
  const ok = (i: number) => ({ ts: t0 + 60 * i, minDv: 2250, maxDv: 2350 });

  it('joins consecutive minutes and keeps the extreme', () => {
    const minutes = [
      ok(0),
      { ts: t0 + 60, minDv: 2060, maxDv: 2300 },
      { ts: t0 + 120, minDv: 2010, maxDv: 2540 },
      { ts: t0 + 180, minDv: 2069, maxDv: 2300 },
      ok(4),
      // A gap (minute 5 missing) breaks an episode.
      { ts: t0 + 360, minDv: 2000, maxDv: 2300 },
    ];
    expect(voltageEpisodes(minutes, VOLTAGE_LIMITS, 1)).toEqual([
      { kind: 'low', start: t0 + 60, end: t0 + 240, minutes: 3, extremeDv: 2010 },
      { kind: 'high', start: t0 + 120, end: t0 + 180, minutes: 1, extremeDv: 2540 },
      { kind: 'low', start: t0 + 360, end: t0 + 420, minutes: 1, extremeDv: 2000 },
    ]);
  });

  it('drops episodes shorter than the minimum, and values at the limit are inside', () => {
    const minutes = [
      { ts: t0, minDv: 2070, maxDv: 2530 },
      { ts: t0 + 60, minDv: 2000, maxDv: 2300 },
      { ts: t0 + 120, minDv: 2000, maxDv: 2300 },
      { ts: t0 + 300, minDv: 1900, maxDv: 2300 },
    ];
    expect(voltageEpisodes(minutes, VOLTAGE_LIMITS, 2)).toEqual([
      { kind: 'low', start: t0 + 60, end: t0 + 180, minutes: 2, extremeDv: 2000 },
    ]);
  });
});

describe('weeklyCompliance', () => {
  it('finds the Monday of a week', () => {
    expect(mondayOf('2026-07-15')).toBe('2026-07-13');
    expect(mondayOf('2026-07-13')).toBe('2026-07-13');
    expect(mondayOf('2026-07-19')).toBe('2026-07-13');
    expect(mondayOf('2027-01-01')).toBe('2026-12-28');
  });

  // Monday 2026-07-13 00:00 in Lisbon (UTC+1).
  const monday = at('2026-07-12T23:00:00Z');
  const week = (avg: (i: number) => number, count = 1008) =>
    Array.from({ length: count }, (_, i) => ({ ts: monday + 600 * i, avgDv: avg(i) }));

  it('allows 5 % outside ± 10 % and none below − 15 %', () => {
    // 50 of 1008 outside (4,96 %): meets; 51 (5,06 %): does not.
    const fifty = weeklyCompliance(
      week((i) => (i < 50 ? 2060 : 2300)),
      [],
      VOLTAGE_LIMITS,
    );
    expect(fifty).toEqual([
      {
        week: '2026-07-13',
        expected: 1008,
        evaluated: 1008,
        excluded: 0,
        outsideBand: 50,
        outsideLimits: 0,
        meetsBand: true,
        meetsLimits: true,
      },
    ]);
    const fiftyOne = weeklyCompliance(
      week((i) => (i < 51 ? 2060 : 2300)),
      [],
      VOLTAGE_LIMITS,
    );
    expect(fiftyOne[0]?.meetsBand).toBe(false);
    const floor = weeklyCompliance(
      week((i) => (i === 7 ? 1950 : 2300)),
      [],
      VOLTAGE_LIMITS,
    );
    expect(floor[0]).toMatchObject({
      outsideBand: 1,
      outsideLimits: 1,
      meetsBand: true,
      meetsLimits: false,
    });
    const high = weeklyCompliance(
      week((i) => (i === 7 ? 2531 : 2300)),
      [],
      VOLTAGE_LIMITS,
    );
    expect(high[0]).toMatchObject({ outsideLimits: 1, meetsLimits: false });
  });

  it('leaves out the 10 minutes that touch an outage', () => {
    const intervals = week((i) => (i < 3 ? 1000 : 2300), 6);
    const outage = { start: monday + 100, end: monday + 1300 };
    expect(weeklyCompliance(intervals, [outage], VOLTAGE_LIMITS)[0]).toMatchObject({
      evaluated: 3,
      excluded: 3,
      outsideBand: 0,
      meetsLimits: true,
    });
  });

  it('counts 1002 intervals in the week the clocks go forward', () => {
    // Monday 2027-03-22 00:00 UTC; Sunday 2027-03-28 has 23 h.
    const result = weeklyCompliance(
      [{ ts: at('2027-03-22T00:00:00Z'), avgDv: 2300 }],
      [],
      VOLTAGE_LIMITS,
    );
    expect(result[0]).toMatchObject({ week: '2027-03-22', expected: 1002 });
  });
});

describe('outages', () => {
  const t0 = at('2026-03-10T10:00:00Z');
  const boot = (deviceId: string, startAt: number | null, bootAt: number, excluded = false) => ({
    deviceId,
    startAt,
    bootAt,
    excluded,
  });

  it('builds outages from boots: short up to 3 min, long above', () => {
    const outages = outagesFromBoots([
      boot('a', null, t0 - 9999),
      boot('a', t0, t0 + 180),
      boot('a', t0 + 3600, t0 + 3781),
    ]);
    expect(outages.map((o) => [o.start, o.seconds, o.long])).toEqual([
      [t0, 180, false],
      [t0 + 3600, 181, true],
    ]);
  });

  it('counts an outage seen by two Shellys once', () => {
    const outages = outagesFromBoots([boot('a', t0, t0 + 600), boot('b', t0 + 60, t0 + 610, true)]);
    expect(outages).toEqual([
      {
        start: t0,
        end: t0 + 610,
        boots: [
          { deviceId: 'a', bootAt: t0 + 600 },
          { deviceId: 'b', bootAt: t0 + 610 },
        ],
        seconds: 610,
        long: true,
        excluded: false,
      },
    ]);
  });

  it('adds up a Lisbon year against the zone standard, without excluded ones', () => {
    const hour = 3600;
    const boots = [
      ...Array.from({ length: 11 }, (_, i) =>
        boot('a', t0 + i * 10 * hour, t0 + i * 10 * hour + 1200),
      ),
      boot('a', t0 + 200 * hour, t0 + 200 * hour + 60),
      boot('a', t0 + 300 * hour, t0 + 300 * hour + 5 * hour, true),
      // 2025-12-31 23:30 in Lisbon: the year before.
      boot('a', at('2025-12-31T23:30:00Z'), at('2025-12-31T23:50:00Z')),
    ];
    const outages = outagesFromBoots(boots);
    expect(yearSummary(outages, 2026, 'A')).toEqual({
      year: 2026,
      longCount: 11,
      longSeconds: 11 * 1200,
      shortCount: 1,
      excludedCount: 1,
      standard: { interruptions: 10, hours: 6 },
      overCount: true,
      overHours: false,
    });
    expect(yearSummary(outages, 2026, 'B').overCount).toBe(false);
    expect(yearSummary(outages, 2026, null)).toMatchObject({ standard: null, overCount: false });
  });
});
