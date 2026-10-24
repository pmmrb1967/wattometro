// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { nextDate, startOfLisbonDay, type LocalDate } from '../lib/time';
import {
  addDays,
  addMonths,
  dayTotal,
  hourlyProfile,
  houseQuarters,
  monthDates,
  quartersByDay,
  weekDates,
  weekdayOf,
} from './consumption';

const QUARTER = 900;

function day(date: LocalDate, wh: (index: number) => number) {
  const quarters = [];
  const end = startOfLisbonDay(nextDate(date));
  for (let ts = startOfLisbonDay(date), index = 0; ts < end; ts += QUARTER, index++) {
    quarters.push({ ts, energyWh: wh(index) });
  }
  return quarters;
}

describe('quartersByDay and dayTotal', () => {
  it('Lisbon days, 23 h and 25 h ones included', () => {
    const days = quartersByDay(
      [...day('2026-10-25', () => 10), ...day('2026-03-29', () => 10)],
      null,
    );
    expect(days.get('2026-03-29')?.length).toBe(92);
    expect(days.get('2026-10-25')?.length).toBe(100);
    expect(dayTotal('2026-10-25', days.get('2026-10-25') ?? [])).toEqual({
      date: '2026-10-25',
      totalWh: 1000,
      byPeriod: { simple: 1000 },
      quarters: 100,
    });
  });

  it('by period of the tariff: bi-hourly daily cycle, empty 22:00–08:00 (pre-2027)', () => {
    // 1 Wh per quarter: 10 h of empty = 40 quarters; 14 h out of it = 56.
    const days = quartersByDay(
      day('2026-05-12', () => 1),
      {
        option: 'bi',
        cycle: 'daily',
        periodsMap: 'pre-2027',
      },
    );
    const total = dayTotal('2026-05-12', days.get('2026-05-12') ?? []);
    expect(total.byPeriod).toEqual({ empty: 40, offEmpty: 56 });
  });
});

describe('calendar helpers', () => {
  it('weekdays from Monday, weeks Monday to Sunday', () => {
    expect(weekdayOf('2026-10-19')).toBe(0); // Monday
    expect(weekdayOf('2026-10-25')).toBe(6); // Sunday
    expect(weekDates('2026-10-23')).toEqual([
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
    ]);
  });

  it('days and months across the year end and leap days', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
    expect(monthDates('2028-02')).toHaveLength(29);
    expect(monthDates('2026-10').at(-1)).toBe('2026-10-31');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
  });
});

describe('hourlyProfile', () => {
  it('average Wh per hour by weekday, over the last 12 weeks', () => {
    // Two Mondays: 4 and 8 Wh per quarter at 03:00 → 16 and 32 Wh in the hour: 24 on average.
    // A Monday 13 weeks before is out.
    const days = quartersByDay(
      [
        ...day('2026-10-19', (index) => (index >= 12 && index < 16 ? 4 : 0)),
        ...day('2026-10-12', (index) => (index >= 12 && index < 16 ? 8 : 0)),
        ...day('2026-07-20', () => 1000),
      ],
      null,
    );
    const profile = hourlyProfile(days, '2026-10-23');
    expect(profile[0]?.[3]).toBe(24);
    expect(profile[0]?.[4]).toBe(0);
    // No Tuesday data.
    expect(profile[1]?.[3]).toBeNull();
  });
});

describe('houseQuarters', () => {
  const eredes = [...day('2026-10-20', () => 100), ...day('2026-10-22', () => 100)];
  const shelly = [
    ...day('2026-10-21', () => 7),
    ...day('2026-10-22', () => 7),
    ...day('2026-10-23', () => 7),
    ...day('2026-10-24', () => 7),
  ];
  const total = (quarters: { energyWh: number }[]) =>
    quarters.reduce((sum, quarter) => sum + quarter.energyWh, 0);

  it('E-Redes up to its last day, the Shelly after it; a gap before is not filled', () => {
    const { quarters, shellyFrom } = houseQuarters(eredes, shelly);
    expect(shellyFrom).toBe('2026-10-23');
    // 2 days × 96 × 100 + 2 days × 96 × 7; 21/10 (no E-Redes) stays empty.
    expect(total(quarters)).toBe(2 * 96 * 100 + 2 * 96 * 7);
    expect(
      quarters.some(
        ({ ts }) => ts >= startOfLisbonDay('2026-10-21') && ts < startOfLisbonDay('2026-10-22'),
      ),
    ).toBe(false);
    expect(quarters.every((q, i) => i === 0 || q.ts > (quarters[i - 1] as { ts: number }).ts)).toBe(
      true,
    );
  });

  it('only the Shelly without E-Redes; only E-Redes when the Shelly has nothing newer', () => {
    expect(houseQuarters([], shelly).shellyFrom).toBe('2026-10-21');
    const old = houseQuarters(
      eredes,
      day('2026-10-21', () => 7),
    );
    expect(old.shellyFrom).toBeNull();
    expect(total(old.quarters)).toBe(2 * 96 * 100);
  });

  it('cuts on the Lisbon day when the clocks go back (25 h)', () => {
    const { quarters, shellyFrom } = houseQuarters(
      day('2026-10-25', () => 100),
      [...day('2026-10-25', () => 7), ...day('2026-10-26', () => 7)],
    );
    expect(shellyFrom).toBe('2026-10-26');
    expect(total(quarters)).toBe(100 * 100 + 96 * 7);
  });
});
