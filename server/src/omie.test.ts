// SPDX-License-Identifier: AGPL-3.0-or-later
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { startOfLisbonDay, startOfMadridDay } from '../../src/lib/time';
import { memorySql } from '../test/sqlite';
import { decideCheapHours } from './alerts';
import type { Sql } from './db';
import { syncOmie, type TextFetcher } from './omie';
import { omieDaysFrom, saveOmieDay } from './repo/omie';
import { QUIET_STATE } from './repo/push';

// 2026-10-26 (winter time: Lisbon is UTC, Madrid UTC+1).
const at = (time: string) => Date.parse(`2026-10-26T${time}:00Z`) / 1000;

/**
 * Tomorrow, 27/10, in quarter hours from 00:00 in Madrid (23:00 in Lisbon):
 * 100 €/MWh, except 13:00–16:00 in Lisbon at 10 €/MWh and 19:00–22:00 at 300 €/MWh.
 * Quarter i starts at 23:00 + 15 min × i in Lisbon: 13:00 is i = 56, 19:00 is i = 80.
 */
const TOMORROW = Array.from({ length: 96 }, (_, i) =>
  i >= 56 && i < 68 ? 1000 : i >= 80 && i < 92 ? 30000 : 10000,
);

const file = (day: string, prices: readonly number[]) =>
  [
    'MARGINALPDBCPT;',
    ...prices.map(
      (price, i) => `${day.replaceAll('-', ';')};${i + 1};${price / 100};${price / 100};`,
    ),
    '*',
  ].join('\n');

describe('syncOmie', () => {
  let sql: Sql;
  let asked: string[];
  let published: Map<string, string>;
  const fetcher: TextFetcher = async (url) => {
    asked.push(url);
    const day = /_(\d{4})(\d{2})(\d{2})\.1$/.exec(url);
    const text = day ? published.get(`${day[1]}-${day[2]}-${day[3]}`) : undefined;
    // OMIE answers a missing file with an HTML page.
    return { ok: true, text: async () => text ?? '<!DOCTYPE html><html></html>' };
  };

  beforeEach(() => {
    sql = memorySql().sql;
    asked = [];
    published = new Map([['2026-10-26', file('2026-10-26', TOMORROW)]]);
  });

  it('reads today at once, and tomorrow from 12:00 in Lisbon when it is out', async () => {
    await syncOmie(sql, at('09:00'), fetcher);
    expect(asked).toHaveLength(1);
    expect((await omieDaysFrom(sql, '2026-10-26')).map((day) => day.date)).toEqual(['2026-10-26']);

    // Not yet published at 12:00: asked again at 12:30, then kept.
    await syncOmie(sql, at('12:00'), fetcher);
    published.set('2026-10-27', file('2026-10-27', TOMORROW));
    await syncOmie(sql, at('12:30'), fetcher);
    await syncOmie(sql, at('13:00'), fetcher);
    expect(asked).toHaveLength(3);
    const [, tomorrow] = await omieDaysFrom(sql, '2026-10-26');
    expect(tomorrow).toMatchObject({
      date: '2026-10-27',
      start: startOfMadridDay('2026-10-27'),
      step: 900,
    });
    expect(tomorrow?.prices).toEqual(TOMORROW);
  });

  it('asks twice an hour at most (the Cron runs every 5 minutes)', async () => {
    for (const time of ['12:05', '12:10', '12:25', '12:35']) await syncOmie(sql, at(time), fetcher);
    expect(asked).toHaveLength(0);
  });

  it('forgets days older than a week once tomorrow arrives', async () => {
    await saveOmieDay(sql, { date: '2026-10-10', step: 900, prices: TOMORROW }, 0, 0);
    await saveOmieDay(sql, { date: '2026-10-20', step: 900, prices: TOMORROW }, 0, 0);
    published.set('2026-10-27', file('2026-10-27', TOMORROW));
    await syncOmie(sql, at('12:00'), fetcher);
    expect((await omieDaysFrom(sql, '2026-01-01')).map((day) => day.date)).toEqual([
      '2026-10-20',
      '2026-10-26',
      '2026-10-27',
    ]);
  });
});

describe('decideCheapHours', () => {
  const tomorrow = {
    date: '2026-10-27',
    start: startOfMadridDay('2026-10-27'),
    step: 900,
    prices: TOMORROW,
  };

  it("announces tomorrow's cheapest and dearest three hours, once", () => {
    const first = decideCheapHours(QUIET_STATE, tomorrow, at('13:00'));
    expect(first.message?.body).toBe(
      'Das 13:00 às 16:00, a energia no mercado custa em média 0,010 €/kWh. As mais caras: das 19:00 às 22:00 (0,300 €/kWh). Só muda a fatura num tarifário com preço à hora.',
    );
    expect(first.state.since).toBe(startOfLisbonDay('2026-10-27'));
    expect(decideCheapHours(first.state, tomorrow, at('13:30')).message).toBeNull();
  });

  it('waits for the prices and for 12:00', () => {
    expect(decideCheapHours(QUIET_STATE, null, at('13:00')).message).toBeNull();
    expect(decideCheapHours(QUIET_STATE, tomorrow, at('11:55')).message).toBeNull();
  });
});

describe('migration 0021', () => {
  it('fills the quarter hours and days already rolled up from the minutes kept', () => {
    const db = new DatabaseSync(':memory:');
    const folder = join(__dirname, '..', 'migrations');
    const files = readdirSync(folder)
      .filter((name) => name.endsWith('.sql'))
      .sort();
    const run = (name: string) => db.exec(readFileSync(join(folder, name), 'utf8'));
    for (const name of files.filter((name) => name < '0021')) run(name);
    // 2026-07-14T23:00Z is 00:00 on 15/7 in Lisbon (summer time).
    const quarter = Date.parse('2026-07-14T23:00:00Z') / 1000;
    db.exec(`INSERT INTO households (id, name, created_at) VALUES ('h', 'Casa', 0);
      INSERT INTO devices (id, household_id, name, token_hash, created_at)
        VALUES ('d', 'h', 'Quadro', 'x', 0);
      INSERT INTO readings_1m (device_id, channel, household_id, ts, samples, energy_wh, power_avg_w,
          power_min_w, power_max_w, voltage_min_dv, voltage_avg_dv, voltage_max_dv, pf_avg_pct,
          apparent_max_va)
        VALUES ('d', 0, 'h', ${quarter}, 60, 1, 1, 1, 3000, 2300, 2300, 2300, 95, 3200),
          ('d', 0, 'h', ${quarter + 60}, 60, 1, 1, 1, 5000, 2300, 2300, 2300, 95, NULL);
      INSERT INTO readings_15m (household_id, meter, ts, source, minutes, energy_wh, power_max_w)
        VALUES ('h', 'd:0', ${quarter}, 'shelly', 2, 2, 5000);
      INSERT INTO daily (household_id, meter, day, source, minutes, energy_wh, power_max_w)
        VALUES ('h', 'd:0', '2026-07-15', 'shelly', 2, 2, 5000),
          ('h', 'd:0', '2026-07-14', 'shelly', 9, 9, 9000);`);
    run(files.find((name) => name.startsWith('0021')) as string);
    const columns = 'apparent_max_va, apparent_minutes, active_only_max_w';
    const filled = { apparent_max_va: 3200, apparent_minutes: 1, active_only_max_w: 5000 };
    expect(db.prepare(`SELECT ${columns} FROM readings_15m`).get()).toEqual(filled);
    expect(db.prepare(`SELECT day, ${columns} FROM daily ORDER BY day`).all()).toEqual([
      { day: '2026-07-14', apparent_max_va: null, apparent_minutes: null, active_only_max_w: null },
      { day: '2026-07-15', ...filled },
    ]);
  });
});

describe('migration 0023', () => {
  it('keeps subscriptions and states, the new alert off, and takes its kind', () => {
    const db = new DatabaseSync(':memory:');
    const folder = join(__dirname, '..', 'migrations');
    const files = readdirSync(folder)
      .filter((name) => name.endsWith('.sql'))
      .sort();
    const run = (name: string) => db.exec(readFileSync(join(folder, name), 'utf8'));
    for (const name of files.filter((name) => name < '0023')) run(name);
    db.exec(`INSERT INTO households (id, name, created_at) VALUES ('h', 'Casa', 0);
      INSERT INTO users (id, household_id, email, password_hash, created_at)
        VALUES ('u', 'h', 'a@b.pt', 'x', 0);
      INSERT INTO push_subscriptions (endpoint, household_id, user_id, p256dh, auth,
          alert_budget, created_at)
        VALUES ('https://push.example/1', 'h', 'u', 'k', 'a', 1, 0);
      INSERT INTO alert_state (household_id, kind, since) VALUES ('h', 'budget', 7);`);
    run(files.find((name) => name.startsWith('0023')) as string);
    expect(db.prepare('SELECT kind, since FROM alert_state').all()).toEqual([
      { kind: 'budget', since: 7 },
    ]);
    expect(
      db.prepare('SELECT alert_budget, alert_unusual_day FROM push_subscriptions').get(),
    ).toEqual({ alert_budget: 1, alert_unusual_day: 0 });
    db.exec(`INSERT INTO alert_state (household_id, kind) VALUES ('h', 'unusualDay')`);
    expect(() =>
      db.exec(`INSERT INTO alert_state (household_id, kind) VALUES ('h', 'nonsense')`),
    ).toThrow();
  });
});

describe('migration 0020', () => {
  it('keeps subscriptions and states, the reminders off, and takes their kinds', () => {
    const db = new DatabaseSync(':memory:');
    const folder = join(__dirname, '..', 'migrations');
    const files = readdirSync(folder)
      .filter((name) => name.endsWith('.sql'))
      .sort();
    const run = (name: string) => db.exec(readFileSync(join(folder, name), 'utf8'));
    for (const name of files.filter((name) => name < '0020')) run(name);
    db.exec(`INSERT INTO households (id, name, created_at) VALUES ('h', 'Casa', 0);
      INSERT INTO users (id, household_id, email, password_hash, created_at)
        VALUES ('u', 'h', 'a@b.pt', 'x', 0);
      INSERT INTO push_subscriptions (endpoint, household_id, user_id, p256dh, auth, created_at)
        VALUES ('https://push.example/1', 'h', 'u', 'k', 'a', 0);
      INSERT INTO alert_state (household_id, kind, since) VALUES ('h', 'cheapHours', 7);`);
    run(files.find((name) => name.startsWith('0020')) as string);
    expect(db.prepare('SELECT kind, since FROM alert_state').all()).toEqual([
      { kind: 'cheapHours', since: 7 },
    ]);
    expect(
      db
        .prepare(
          'SELECT alert_eredes_import, alert_tariff_review, alert_budget FROM push_subscriptions',
        )
        .get(),
    ).toEqual({ alert_eredes_import: 0, alert_tariff_review: 0, alert_budget: 0 });
    db.exec(`INSERT INTO alert_state (household_id, kind) VALUES ('h', 'budget');
      INSERT INTO household_budget (household_id, cents, wh_per_day, updated_at)
        VALUES ('h', 8000, 9500, 0);`);
    expect(() =>
      db.exec(`INSERT INTO household_budget (household_id, cents, wh_per_day, updated_at)
        VALUES ('h', 0, 1, 0)`),
    ).toThrow();
  });
});

describe('migration 0019', () => {
  it('keeps the alert states and leaves the new alert off', () => {
    const db = new DatabaseSync(':memory:');
    const folder = join(__dirname, '..', 'migrations');
    const files = readdirSync(folder)
      .filter((name) => name.endsWith('.sql'))
      .sort();
    const run = (name: string) => db.exec(readFileSync(join(folder, name), 'utf8'));
    for (const name of files.filter((name) => name < '0019')) run(name);
    db.exec(`INSERT INTO households (id, name, created_at) VALUES ('h', 'Casa', 0);
      INSERT INTO users (id, household_id, email, password_hash, created_at)
        VALUES ('u', 'h', 'a@b.pt', 'x', 0);
      INSERT INTO push_subscriptions (endpoint, household_id, user_id, p256dh, auth, created_at)
        VALUES ('https://push.example/1', 'h', 'u', 'k', 'a', 0);
      INSERT INTO alert_state (household_id, kind, active, since) VALUES ('h', 'stale', 1, 42);`);
    run(files.find((name) => name.startsWith('0019')) as string);
    expect(db.prepare('SELECT kind, active, since FROM alert_state').all()).toEqual([
      { kind: 'stale', active: 1, since: 42 },
    ]);
    expect(db.prepare('SELECT alert_cheap_hours FROM push_subscriptions').get()).toEqual({
      alert_cheap_hours: 0,
    });
    db.exec(`INSERT INTO alert_state (household_id, kind) VALUES ('h', 'cheapHours')`);
  });
});
