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
