// SPDX-License-Identifier: AGPL-3.0-or-later
import type { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { memorySql } from '../test/sqlite';
import type { Sql } from './db';
import { createDevice } from './repo/devices';
import { createHousehold } from './repo/households';
import { minuteStatements } from './repo/readings';
import { getState } from './repo/rollups';
import { LATE_SECONDS, MAX_SPAN_SECONDS, runMaintenance, STATE } from './rollups';

const at = (iso: string) => Date.parse(iso) / 1000;
const DAY = 86_400;

let sql: Sql;
let db: DatabaseSync;
let householdId: string;
let deviceId: string;

beforeEach(async () => {
  const memory = memorySql();
  sql = memory.sql;
  db = memory.db;
  householdId = (await createHousehold(sql, 'Casa', 0)).id;
  deviceId = (
    await createDevice(sql, { householdId, name: 'Quadro', tokenHash: 'a'.repeat(64) }, 0)
  ).id;
});

interface Fields {
  channel?: number;
  energyWh?: number;
  powerMaxW?: number;
  voltageMinDv?: number;
  voltageMaxDv?: number;
  seconds?: boolean;
}

async function minute(ts: number, fields: Fields = {}, device = { id: deviceId, householdId }) {
  await sql.batch(
    minuteStatements(device, {
      ts,
      channel: fields.channel ?? 0,
      samples: 60,
      energyWh: fields.energyWh ?? 1,
      powerAvgW: 60,
      powerMinW: 50,
      powerMaxW: fields.powerMaxW ?? 70,
      voltageMinDv: fields.voltageMinDv ?? 2300,
      voltageAvgDv: 2310,
      voltageMaxDv: fields.voltageMaxDv ?? 2320,
      pfAvgPct: 95,
      apparentMaxVa: null,
      seconds: fields.seconds ? new Uint8Array(361) : null,
    }),
  );
}

const quarters = () =>
  db
    .prepare(
      'SELECT meter, ts, source, minutes, energy_wh, power_max_w, voltage_min_dv, voltage_max_dv FROM readings_15m ORDER BY meter, ts',
    )
    .all();
const days = () =>
  db
    .prepare(
      'SELECT meter, day, minutes, energy_wh, power_max_w, voltage_min_dv, voltage_max_dv FROM daily ORDER BY meter, day',
    )
    .all();
const count = (table: string) =>
  (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

describe('10-minute voltage', () => {
  it('averages the minutes per 10 minutes, with their extremes', async () => {
    const start = at('2026-01-15T10:00:00Z');
    for (let i = 0; i < 12; i++) {
      await minute(start + 60 * i, { voltageMinDv: 2300 - i, voltageMaxDv: 2400 + i });
    }
    await runMaintenance(sql, start + 3600);
    expect(
      db
        .prepare(
          'SELECT meter, ts, minutes, voltage_avg_dv, voltage_min_dv, voltage_max_dv FROM voltage_10m ORDER BY ts',
        )
        .all(),
    ).toEqual([
      {
        meter: `${deviceId}:0`,
        ts: start,
        minutes: 10,
        voltage_avg_dv: 2310,
        voltage_min_dv: 2291,
        voltage_max_dv: 2409,
      },
      {
        meter: `${deviceId}:0`,
        ts: start + 600,
        minutes: 2,
        voltage_avg_dv: 2310,
        voltage_min_dv: 2289,
        voltage_max_dv: 2411,
      },
    ]);
  });
});

describe('quarter hours', () => {
  it('adds up minutes per meter and quarter hour, with the peaks and voltage extremes', async () => {
    const start = at('2026-01-15T10:00:00Z');
    for (let i = 0; i < 30; i++) {
      await minute(start + 60 * i, {
        energyWh: 2,
        powerMaxW: 100 + i,
        voltageMinDv: 2300 - i,
        voltageMaxDv: 2400 + i,
      });
    }
    await minute(start, { channel: 1, energyWh: 5 });
    await runMaintenance(sql, start + 3600);

    const meter = `${deviceId}:0`;
    expect(quarters()).toEqual([
      {
        meter,
        ts: start,
        source: 'shelly',
        minutes: 15,
        energy_wh: 30,
        power_max_w: 114,
        voltage_min_dv: 2286,
        voltage_max_dv: 2414,
      },
      {
        meter,
        ts: start + 900,
        source: 'shelly',
        minutes: 15,
        energy_wh: 30,
        power_max_w: 129,
        voltage_min_dv: 2271,
        voltage_max_dv: 2429,
      },
      {
        meter: `${deviceId}:1`,
        ts: start,
        source: 'shelly',
        minutes: 1,
        energy_wh: 5,
        power_max_w: 70,
        voltage_min_dv: 2300,
        voltage_max_dv: 2320,
      },
    ]);
    expect(days()).toEqual([
      {
        meter,
        day: '2026-01-15',
        minutes: 30,
        energy_wh: 60,
        power_max_w: 129,
        voltage_min_dv: 2271,
        voltage_max_dv: 2429,
      },
      {
        meter: `${deviceId}:1`,
        day: '2026-01-15',
        minutes: 1,
        energy_wh: 5,
        power_max_w: 70,
        voltage_min_dv: 2300,
        voltage_max_dv: 2320,
      },
    ]);
  });

  it('includes the quarter hour in progress and completes it on the next run', async () => {
    const start = at('2026-01-15T10:00:00Z');
    await minute(start);
    await minute(start + 60);
    await runMaintenance(sql, start + 125);
    expect(quarters()).toMatchObject([{ ts: start, minutes: 2, energy_wh: 2 }]);
    await minute(start + 120);
    await runMaintenance(sql, start + 185);
    expect(quarters()).toMatchObject([{ ts: start, minutes: 3, energy_wh: 3 }]);
  });
});

describe('Lisbon days', () => {
  it('gives 2026-10-25 its 25 hours (summer time ends)', async () => {
    // 23:59 Lisbon on the 24th (WEST), then four minutes that all belong to the 25th:
    // 00:30 WEST, 01:30 WEST, 01:30 WET (the repeated hour) and 23:30 WET.
    await minute(at('2026-10-24T22:59:00Z'), { energyWh: 100 });
    for (const iso of [
      '2026-10-24T23:30:00Z',
      '2026-10-25T00:30:00Z',
      '2026-10-25T01:30:00Z',
      '2026-10-25T23:30:00Z',
    ]) {
      await minute(at(iso), { energyWh: 1 });
    }
    // 00:00 WET on the 26th.
    await minute(at('2026-10-26T00:00:00Z'), { energyWh: 10 });
    await runMaintenance(sql, at('2026-10-26T01:00:00Z'));
    expect(days()).toMatchObject([
      { day: '2026-10-24', energy_wh: 100 },
      { day: '2026-10-25', energy_wh: 4, minutes: 4 },
      { day: '2026-10-26', energy_wh: 10 },
    ]);
  });

  it('gives 2026-03-29 its 23 hours (summer time starts)', async () => {
    await minute(at('2026-03-28T23:59:00Z'), { energyWh: 100 }); // 23:59 WET on the 28th
    await minute(at('2026-03-29T00:00:00Z'), { energyWh: 1 }); // 00:00 WET
    await minute(at('2026-03-29T01:00:00Z'), { energyWh: 1 }); // 02:00 WEST (01:00 never happens)
    await minute(at('2026-03-29T22:59:00Z'), { energyWh: 1 }); // 23:59 WEST
    await minute(at('2026-03-29T23:00:00Z'), { energyWh: 10 }); // 00:00 WEST on the 30th
    await runMaintenance(sql, at('2026-03-30T01:00:00Z'));
    expect(days()).toMatchObject([
      { day: '2026-03-28', energy_wh: 100 },
      { day: '2026-03-29', energy_wh: 3, minutes: 3 },
      { day: '2026-03-30', energy_wh: 10 },
    ]);
  });
});

describe('incremental runs', () => {
  it('counts minutes that arrive late, within LATE_SECONDS', async () => {
    const now = at('2026-01-15T12:00:00Z');
    await minute(now - 600);
    await runMaintenance(sql, now);
    // The Shelly comes back with two hours of queued minutes.
    await minute(now - 2 * 3600, { energyWh: 7 });
    await runMaintenance(sql, now + 300);
    expect(days()).toMatchObject([{ day: '2026-01-15', energy_wh: 8, minutes: 2 }]);
  });

  it('does not reach back further than LATE_SECONDS', async () => {
    const now = at('2026-01-15T12:00:00Z');
    await minute(now - 600);
    await runMaintenance(sql, now);
    await minute(now - LATE_SECONDS - 900, { energyWh: 7 });
    await runMaintenance(sql, now + 300);
    expect(days()).toMatchObject([{ day: '2026-01-15', energy_wh: 1 }]);
  });

  it('gives the same result when run again', async () => {
    const now = at('2026-01-15T12:00:00Z');
    for (let i = 0; i < 20; i++) await minute(now - 3600 + 60 * i, { energyWh: i });
    await runMaintenance(sql, now);
    const first = [quarters(), days()];
    await runMaintenance(sql, now + 300);
    await runMaintenance(sql, now + 600);
    expect([quarters(), days()]).toEqual(first);
  });

  it('catches up a long history a week at a time', async () => {
    const now = at('2026-01-31T12:00:00Z');
    const first = now - 10 * DAY;
    await minute(first);
    await minute(now - 600);
    await runMaintenance(sql, now);
    expect(await getState(sql, STATE.rolledUpUntil(householdId))).toBe(first + MAX_SPAN_SECONDS);
    expect(days()).toHaveLength(1);
    await runMaintenance(sql, now + 300);
    expect(await getState(sql, STATE.rolledUpUntil(householdId))).toBe(now + 300);
    expect(days()).toHaveLength(2);
  });

  it('skips a household without readings and keeps households apart', async () => {
    const other = (await createHousehold(sql, 'Outra', 0)).id;
    const now = at('2026-01-15T12:00:00Z');
    await minute(now - 600);
    await runMaintenance(sql, now);
    expect(await getState(sql, STATE.rolledUpUntil(other))).toBeNull();
    expect(db.prepare('SELECT DISTINCT household_id FROM daily').all()).toEqual([
      { household_id: householdId },
    ]);
  });
});

describe('retention', () => {
  it('purges minutes after 730 days and per-second values after 90, once a day', async () => {
    const now = at('2026-06-01T00:00:00Z');
    await minute(now - 731 * DAY, { seconds: true });
    await minute(now - 729 * DAY, { seconds: true });
    await minute(now - 91 * DAY, { seconds: true });
    await minute(now - 89 * DAY, { seconds: true });
    await runMaintenance(sql, now);
    expect(count('readings_1m')).toBe(3);
    expect(count('readings_1s')).toBe(1);

    // Within the day, nothing more is purged.
    await minute(now - 800 * DAY);
    await runMaintenance(sql, now + 3600);
    expect(count('readings_1m')).toBe(4);
    await runMaintenance(sql, now + DAY);
    expect(count('readings_1m')).toBe(3);
  });

  it('honours other retention periods and keeps the aggregates', async () => {
    const now = at('2026-06-01T00:00:00Z');
    await minute(now - 20 * DAY, { seconds: true });
    await runMaintenance(sql, now - 20 * DAY + 600, { retention1mDays: 10, retention1sDays: 5 });
    await runMaintenance(sql, now, { retention1mDays: 10, retention1sDays: 5 });
    expect(count('readings_1m')).toBe(0);
    expect(count('readings_1s')).toBe(0);
    expect(count('readings_15m')).toBe(1);
    expect(count('daily')).toBe(1);
  });
});

it('records the database size', async () => {
  await runMaintenance(sql, at('2026-01-15T12:00:00Z'));
  expect(await getState(sql, STATE.databaseBytes)).toBeGreaterThan(0);
});
