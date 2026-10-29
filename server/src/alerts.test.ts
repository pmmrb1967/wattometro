// SPDX-License-Identifier: AGPL-3.0-or-later
import type { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { tariffInputSchema } from '../../src/domain/tariff';
import { memorySql } from '../test/sqlite';
import {
  checkAlerts,
  decideBudget,
  decideDatabase,
  decideEredesImport,
  decidePower,
  decideStale,
  decideTariffReview,
  decideUnusualDay,
  houseDays,
  reminderDue,
  type AlertMessage,
} from './alerts';
import { lisbonDayLength, nextDate, startOfLisbonDay } from '../../src/lib/time';
import { UNKNOWN_INSTALLATION } from '../../src/domain/installation';
import { createApp } from './app';
import { toBase64Url } from '../../src/lib/base64url';
import type { Sql } from './db';
import { hashPassword } from './password';
import { createDevice } from './repo/devices';
import { createHousehold, setHouseholdBudget, setHouseholdInstallation } from './repo/households';
import { minuteStatements } from './repo/readings';
import { saveOmieDay } from './repo/omie';
import { QUIET_STATE, saveSubscription, type AlertChoice } from './repo/push';
import { saveTariff } from './repo/tariffs';
import { addRowsRead, utcDay } from './repo/usage';
import { createUser } from './repo/users';

// 2026-10-26 18:00 UTC (18:00 in Lisbon, winter time).
const NOW = 1_793_037_600;
const ORIGIN = 'https://app.example';
const PASSWORD = 'uma password comprida';
// A device's keys (RFC 8291, Appendix A: synthetic).
const DEVICE_KEYS = {
  p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
};
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/telemovel';
const NO_ALERTS: AlertChoice = {
  stale: false,
  power: false,
  database: false,
  cheapHours: false,
  eredesImport: false,
  tariffReview: false,
  budget: false,
  unusualDay: false,
};

async function vapid() {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
  ])) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  return { publicKey: toBase64Url(raw), privateKey: jwk.d as string, subject: 'mailto:a@b.pt' };
}

describe('the decisions', () => {
  const device = (minutesAgo: number) => ({ name: 'Quadro', lastSeenAt: NOW - minutesAgo * 60 });

  it('says once that the Shelly went quiet, and once that it is back', () => {
    expect(decideStale(QUIET_STATE, device(5), NOW).message).toBeNull();
    const quiet = decideStale(QUIET_STATE, device(20), NOW);
    expect(quiet.message?.title).toBe('O Shelly deixou de enviar');
    expect(quiet.message?.body).toContain('desde as 17:40');
    expect(decideStale(quiet.state, device(25), NOW + 300).message).toBeNull();
    const back = decideStale(quiet.state, device(0), NOW + 600);
    expect(back.message?.title).toBe('O Shelly voltou a enviar');
    expect(back.state.active).toBe(false);
    expect(decideStale(QUIET_STATE, null, NOW).message).toBeNull();
  });

  it('announces a peak above 1.2 × the contracted power, at most once an hour', () => {
    const peaks = [
      { ts: NOW - 240, peak: 8_000 },
      { ts: NOW - 180, peak: 8_400 },
      { ts: NOW - 120, peak: 8_300 },
    ];
    // 1.2 × 6900 VA = 8280 VA.
    const first = decidePower(QUIET_STATE, peaks, 6_900, NOW);
    expect(first.message?.body).toBe(
      'Às 17:57 chegaste a 8,4\u00a0kVA, acima de 1,2 × a potência contratada (6,9\u00a0kVA): o contador começou a contar para cortar a luz.',
    );
    expect(first.state.checkedUntil).toBe(NOW - 60);
    // The same minutes again (looked at once more) and a new one within the hour: quiet.
    const again = decidePower(
      first.state,
      [...peaks, { ts: NOW + 60, peak: 9_000 }],
      6_900,
      NOW + 120,
    );
    expect(again.message).toBeNull();
    // An hour later, a new peak is announced.
    const later = decidePower(again.state, [{ ts: NOW + 3_700, peak: 8_500 }], 6_900, NOW + 3_800);
    expect(later.message).not.toBeNull();
    // Without a tariff there is no limit to compare with.
    expect(decidePower(QUIET_STATE, peaks, null, NOW).message).toBeNull();
    expect(decidePower(QUIET_STATE, [{ ts: NOW, peak: 8_280 }], 6_900, NOW).message).toBeNull();
  });

  it('warns once a UTC day past 80 % of the rows D1 may read', () => {
    expect(decideDatabase(QUIET_STATE, 3_999_999, 5_000_000, NOW).message).toBeNull();
    const warned = decideDatabase(QUIET_STATE, 4_100_000, 5_000_000, NOW);
    // Midnight UTC is midnight in Lisbon in winter.
    expect(warned.message?.body).toContain('82 %');
    expect(warned.message?.body).toContain('até às 00:00');
    expect(decideDatabase(warned.state, 4_500_000, 5_000_000, NOW + 600).message).toBeNull();
    expect(decideDatabase(warned.state, 4_100_000, 5_000_000, NOW + 86_400).message).not.toBeNull();
  });
});

describe('the reminders', () => {
  // 2026-10-26 18:00 in Lisbon.
  const day = (date: string, hour = 11) => startOfLisbonDay(date) + hour * 3600;

  it('are looked at once a Lisbon day, from 10:00', () => {
    expect(reminderDue(QUIET_STATE, day('2026-10-26', 9))).toBe(false);
    expect(reminderDue(QUIET_STATE, day('2026-10-26'))).toBe(true);
    const checked = decideTariffReview(QUIET_STATE, day('2026-10-26')).state;
    expect(reminderDue(checked, day('2026-10-26', 18))).toBe(false);
    expect(reminderDue(checked, day('2026-10-27'))).toBe(true);
  });

  it('E-Redes: when the last day is over a month old, at most once a month', () => {
    expect(decideEredesImport(QUIET_STATE, null, NOW).message).toBeNull();
    expect(decideEredesImport(QUIET_STATE, '2026-10-01', NOW).message).toBeNull();
    const first = decideEredesImport(QUIET_STATE, '2026-09-20', NOW);
    expect(first.message?.body).toContain('20/09/2026');
    expect(first.message?.url).toBe('/definicoes#dados');
    expect(decideEredesImport(first.state, '2026-09-20', NOW + 20 * 86_400).message).toBeNull();
    expect(decideEredesImport(first.state, '2026-09-20', NOW + 31 * 86_400).message).not.toBeNull();
  });

  it('tariff: once in January and once in July', () => {
    expect(decideTariffReview(QUIET_STATE, day('2026-10-26')).message).toBeNull();
    const january = decideTariffReview(QUIET_STATE, day('2027-01-04'));
    expect(january.message?.title).toBe('Rever o tarifário');
    expect(decideTariffReview(january.state, day('2027-01-20')).message).toBeNull();
    expect(decideTariffReview(january.state, day('2027-07-01')).message).not.toBeNull();
  });

  it("budget: from the 7th, when the month's pace passes it, once a month", () => {
    // 10 kWh a day buys the budget; October has 31 days.
    const budget = { cents: 8000, whPerDay: 10_000 };
    // On the 10th at 00:00: 9 days. At 9 kWh a day, within; at 12, past it.
    const tenth = startOfLisbonDay('2026-10-10');
    expect(decideBudget(QUIET_STATE, budget, 9 * 9_000, tenth).message).toBeNull();
    const over = decideBudget(QUIET_STATE, budget, 9 * 12_000, tenth);
    expect(over.message?.body).toMatch(/80,00\s€/);
    expect(decideBudget(over.state, budget, 10 * 12_000, tenth + 86_400).message).toBeNull();
    // Too early in the month, and without a budget.
    expect(decideBudget(QUIET_STATE, budget, 5 * 20_000, day('2026-10-05')).message).toBeNull();
    expect(decideBudget(QUIET_STATE, null, 9 * 12_000, tenth).message).toBeNull();
    // A new month, a new reminder.
    const november = startOfLisbonDay('2026-11-10');
    expect(decideBudget(over.state, budget, 9 * 12_000, november).message).not.toBeNull();
  });
});

describe('an unusual day', () => {
  /** Every day from `from` to `to` (inclusive), ~10 kWh, a little apart from each other. */
  const usual = (from: string, to: string) => {
    const days: { date: string; wh: number }[] = [];
    for (let date = from, i = 0; date <= to; date = nextDate(date), i++) {
      days.push({ date, wh: 10_000 + (i % 3) * 200 });
    }
    return days;
  };
  // Thursday 22/10 at 11:00: yesterday was a working day.
  const now = startOfLisbonDay('2026-10-22') + 11 * 3600;

  it('tells of yesterday far above the usual, once', () => {
    const days = [...usual('2026-07-29', '2026-10-20'), { date: '2026-10-21', wh: 20_000 }];
    const first = decideUnusualDay(QUIET_STATE, days, false, now);
    expect(first.message?.title).toBe('Ontem, fora do habitual');
    // The median of the 12 working days before is 10,2 kWh: 20 is 96 % more.
    expect(first.message?.body).toMatch(/^Ontem: 96 % mais do que o habitual \(20,0\s?kWh/);
    expect(first.message?.url).toBe('/consumo#fora-do-habitual');
    expect(decideUnusualDay(first.state, days, false, now + 3600).message).toBeNull();
  });

  it('says nothing for a usual day, a day not yet in, or a house that follows the weather', () => {
    const days = usual('2026-07-29', '2026-10-21');
    expect(decideUnusualDay(QUIET_STATE, days, false, now).message).toBeNull();
    const high = [...usual('2026-07-29', '2026-10-20'), { date: '2026-10-21', wh: 20_000 }];
    expect(decideUnusualDay(QUIET_STATE, high.slice(0, -1), false, now).message).toBeNull();
    expect(decideUnusualDay(QUIET_STATE, high, true, now).message).toBeNull();
  });

  it('takes the main Shelly when the day is whole, else E-Redes', () => {
    const shelly = 'd:0';
    expect(
      houseDays([
        // E-Redes only.
        { meter: 'eredes', day: '2026-10-20', energyWh: 9_000, minutes: null, quarters: 96 },
        // Both whole: the Shelly.
        { meter: 'eredes', day: '2026-10-21', energyWh: 9_100, minutes: null, quarters: 96 },
        { meter: shelly, day: '2026-10-21', energyWh: 9_300, minutes: 1440, quarters: null },
        // The Shelly missed 2 hours: E-Redes.
        { meter: 'eredes', day: '2026-10-22', energyWh: 9_200, minutes: null, quarters: 96 },
        { meter: shelly, day: '2026-10-22', energyWh: 8_000, minutes: 1320, quarters: null },
        // A circuit (less energy) is never the house.
        { meter: 'd:1', day: '2026-10-23', energyWh: 2_000, minutes: 1440, quarters: null },
        // The day of 25 h: 1500 minutes, 96 quarter hours are whole.
        { meter: shelly, day: '2026-10-25', energyWh: 9_400, minutes: 1500, quarters: null },
        { meter: 'eredes', day: '2026-10-26', energyWh: 50, minutes: null, quarters: 2 },
      ]),
    ).toEqual([
      { date: '2026-10-20', wh: 9_000 },
      { date: '2026-10-21', wh: 9_300 },
      { date: '2026-10-22', wh: 9_200 },
      { date: '2026-10-25', wh: 9_400 },
    ]);
  });
});

describe('a Cron run', () => {
  let sql: Sql;
  let db: DatabaseSync;
  let household: string;
  let user: { id: string; householdId: string };
  let deviceId: string;
  let sent: { url: string; body: Uint8Array }[];
  let status: number;
  const fetcher = async (url: string, init: RequestInit) => {
    sent.push({ url, body: init.body as Uint8Array });
    return { status };
  };

  beforeEach(async () => {
    const memory = memorySql();
    sql = memory.sql;
    db = memory.db;
    sent = [];
    status = 201;
    household = (await createHousehold(sql, 'Casa', NOW - 86_400)).id;
    const created = await createUser(
      sql,
      {
        householdId: household,
        email: 'ana@example.pt',
        passwordHash: await hashPassword(PASSWORD, 1000),
      },
      NOW,
    );
    user = { id: created.id, householdId: household };
    deviceId = (
      await createDevice(
        sql,
        { householdId: household, name: 'Quadro', tokenHash: 'h' },
        NOW - 86_400,
      )
    ).id;
    await saveTariff(
      sql,
      household,
      tariffInputSchema.parse({
        validFrom: '2026-10-01',
        supplier: 'Teste',
        powerVa: 6900,
        option: 'tri',
        cycle: 'weekly',
        periodsMap: 'pre-2027',
        fixedPerDay: 343_600,
        energy: { peak: 250_000, full: 180_000, empty: 100_000 },
        iecPerKwh: 1_000,
        cavPerMonth: 2_850_000,
        dgegPerMonth: 70_000,
        largeFamily: false,
        energyDiscountBp: 0,
        socialEnergyPerKwh: 0,
        socialPowerPerDay: 0,
        socialFinancingPerKwh: 0,
      }),
      NOW,
    );
  });

  const seen = (ts: number) =>
    db.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?').run(ts, deviceId);
  const minute = async (ts: number, apparentMaxVa: number) => {
    const statements = minuteStatements(
      { id: deviceId, householdId: household },
      {
        ts,
        channel: 0,
        samples: 60,
        energyWh: 50,
        powerAvgW: 3000,
        powerMinW: 2000,
        powerMaxW: 7000,
        voltageMinDv: 2300,
        voltageAvgDv: 2310,
        voltageMaxDv: 2320,
        pfAvgPct: 95,
        apparentMaxVa,
        seconds: null,
      },
    );
    await sql.batch(statements);
  };
  const subscribe = (alerts: Partial<AlertChoice> = { stale: true, power: true, database: true }) =>
    saveSubscription(
      sql,
      user,
      { endpoint: ENDPOINT, ...DEVICE_KEYS, alerts: { ...NO_ALERTS, ...alerts } },
      NOW,
    );

  it('reads nothing more for a household nobody subscribed in', async () => {
    seen(NOW - 3_600);
    await checkAlerts(sql, household, NOW, {
      vapid: await vapid(),
      rowsReadLimit: 5_000_000,
      fetcher,
    });
    expect(sent).toHaveLength(0);
    expect(db.prepare('SELECT COUNT(*) AS n FROM alert_state').get()).toEqual({ n: 0 });
  });

  it('sends an encrypted alert for a quiet Shelly and a peak, once', async () => {
    await subscribe();
    seen(NOW - 20 * 60);
    await minute(NOW - 15 * 60, 8_500);
    // The first run looks back 20 minutes: that peak is in it.
    const config = { vapid: await vapid(), rowsReadLimit: 5_000_000, fetcher };
    await checkAlerts(sql, household, NOW, config);
    expect(sent.map((item) => item.url)).toEqual([ENDPOINT, ENDPOINT]);
    // Encrypted: the text is not in what goes to the push service.
    expect(new TextDecoder().decode(sent[0]?.body)).not.toContain('Shelly');
    await checkAlerts(sql, household, NOW + 300, config);
    expect(sent).toHaveLength(2);
  });

  it('sends only the alerts a device chose', async () => {
    await subscribe({ power: true });
    seen(NOW - 20 * 60);
    await addRowsRead(sql, utcDay(NOW), 4_500_000);
    await checkAlerts(sql, household, NOW, {
      vapid: await vapid(),
      rowsReadLimit: 5_000_000,
      fetcher,
    });
    expect(sent).toHaveLength(0);
  });

  it("sends tomorrow's cheap hours once, to the devices that asked", async () => {
    await subscribe({ cheapHours: true });
    // 27/10 starts at 00:00 in Madrid: 26/10 23:00 in Lisbon.
    const prices = Array.from({ length: 96 }, (_, i) => (i >= 56 && i < 68 ? 1000 : 10000));
    await saveOmieDay(sql, { date: '2026-10-27', step: 900, prices }, NOW + 5 * 3600, NOW);
    const config = { vapid: await vapid(), rowsReadLimit: 5_000_000, fetcher };
    await checkAlerts(sql, household, NOW, config);
    await checkAlerts(sql, household, NOW + 300, config);
    expect(sent).toHaveLength(1);
  });

  it('reminds of the budget once, reading the month only once a day', async () => {
    await subscribe({ budget: true });
    await setHouseholdBudget(sql, household, { cents: 5000, whPerDay: 500 }, NOW);
    // 26/10 at 18:00: 20 kWh in 25,75 days is past 0,5 kWh a day.
    db.prepare(
      `INSERT INTO daily (household_id, meter, day, source, minutes, energy_wh)
       VALUES (?, ?, '2026-10-20', 'shelly', 1440, 20000)`,
    ).run(household, `${deviceId}:0`);
    const config = { vapid: await vapid(), rowsReadLimit: 5_000_000, fetcher };
    await checkAlerts(sql, household, NOW, config);
    await checkAlerts(sql, household, NOW + 300, config);
    expect(sent).toHaveLength(1);
    expect(db.prepare(`SELECT checked_until FROM alert_state WHERE kind = 'budget'`).get()).toEqual(
      {
        checked_until: startOfLisbonDay('2026-10-26'),
      },
    );
  });

  it('tells of an unusual yesterday, only when the house does not follow the weather', async () => {
    await subscribe({ unusualDay: true });
    // Every day from 01/08 to Sunday 25/10 (the day of 25 h), whole; 25/10 at 20 kWh.
    const insert = db.prepare(
      `INSERT INTO daily (household_id, meter, day, source, minutes, energy_wh)
       VALUES (?, ?, ?, 'shelly', ?, ?)`,
    );
    for (let date = '2026-08-01', i = 0; date <= '2026-10-25'; date = nextDate(date), i++) {
      const wh = date === '2026-10-25' ? 20_000 : 10_000 + (i % 3) * 200;
      insert.run(household, `${deviceId}:0`, date, lisbonDayLength(date) / 60, wh);
    }
    const config = { vapid: await vapid(), rowsReadLimit: 5_000_000, fetcher };
    // Nothing said about the installation: the weather may matter, no alert.
    await checkAlerts(sql, household, NOW, config);
    expect(sent).toHaveLength(0);
    // Gas heating, no air conditioning: the next morning's look tells of it, once.
    await setHouseholdInstallation(
      sql,
      household,
      { ...UNKNOWN_INSTALLATION, heating: ['gas-boiler'], airConditioning: false },
      NOW,
    );
    db.prepare(`DELETE FROM alert_state WHERE kind = 'unusualDay'`).run();
    await checkAlerts(sql, household, NOW, config);
    await checkAlerts(sql, household, NOW + 300, config);
    expect(sent).toHaveLength(1);
  });

  it('forgets a device the push service says is gone', async () => {
    await subscribe();
    seen(NOW - 20 * 60);
    status = 410;
    await checkAlerts(sql, household, NOW, {
      vapid: await vapid(),
      rowsReadLimit: 5_000_000,
      fetcher,
    });
    expect(db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').get()).toEqual({ n: 0 });
  });
});

describe('/v1/push', () => {
  let app: ReturnType<typeof createApp>;
  let cookie: string;
  let pushed: AlertMessage[];

  beforeEach(async () => {
    const memory = memorySql();
    const household = (await createHousehold(memory.sql, 'Casa', NOW)).id;
    for (const email of ['ana@example.pt', 'rui@example.pt']) {
      await createUser(
        memory.sql,
        { householdId: household, email, passwordHash: await hashPassword(PASSWORD, 1000) },
        NOW,
      );
    }
    pushed = [];
    app = createApp({
      sql: memory.sql,
      sessionSecret: 's'.repeat(32),
      allowedOrigins: [],
      now: () => NOW,
      vapid: await vapid(),
      pushFetcher: async () => {
        pushed.push({ title: '', body: '', tag: 'test', url: '' });
        return { status: 201 };
      },
    });
    cookie = await signIn();
  });

  async function signIn(email = 'ana@example.pt') {
    const response = await app.request(`${ORIGIN}/v1/auth/login`, {
      method: 'POST',
      headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    return `__Host-wm_session=${/__Host-wm_session=([^;]+)/.exec(response.headers.get('Set-Cookie') ?? '')?.[1]}`;
  }

  const call = (method: string, path: string, body?: unknown, as = cookie) =>
    app.request(`${ORIGIN}${path}`, {
      method,
      headers: { Origin: ORIGIN, Cookie: as, 'Content-Type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  const find = (as = cookie) =>
    call('GET', `/v1/push/subscription?endpoint=${encodeURIComponent(ENDPOINT)}`, undefined, as);
  const alerts = { ...NO_ALERTS, stale: true, database: true, cheapHours: true, budget: true };

  it('gives the public key, keeps the subscription and sends a test', async () => {
    expect(
      ((await (await call('GET', '/v1/push/key')).json()) as { publicKey: string }).publicKey,
    ).toMatch(/^B[\w-]{86}$/);
    expect((await find()).status).toBe(404);
    const saved = await call('PUT', '/v1/push/subscription', {
      endpoint: ENDPOINT,
      keys: DEVICE_KEYS,
      alerts,
    });
    expect(saved.status).toBe(204);
    expect(await (await find()).json()).toEqual({ alerts });
    // Another user does not see it.
    expect((await find(await signIn('rui@example.pt'))).status).toBe(404);
    expect((await call('POST', '/v1/push/test', { endpoint: ENDPOINT })).status).toBe(204);
    expect(pushed).toHaveLength(1);
    expect((await call('DELETE', '/v1/push/subscription', { endpoint: ENDPOINT })).status).toBe(
      204,
    );
    expect((await find()).status).toBe(404);
  });

  it('leaves the cheap hours off for an app cached before them', async () => {
    const older = { stale: true, power: false, database: true };
    await call('PUT', '/v1/push/subscription', {
      endpoint: ENDPOINT,
      keys: DEVICE_KEYS,
      alerts: older,
    });
    expect(await (await find()).json()).toEqual({ alerts: { ...NO_ALERTS, ...older } });
  });

  it("keeps the household's budget, and removes it", async () => {
    expect(await (await call('GET', '/v1/household/budget')).json()).toEqual({ budget: null });
    const budget = { cents: 8000, whPerDay: 9_500 };
    expect((await call('PUT', '/v1/household/budget', { budget })).status).toBe(204);
    expect(await (await call('GET', '/v1/household/budget')).json()).toEqual({ budget });
    expect((await call('PUT', '/v1/household/budget', { budget: { cents: -1 } })).status).toBe(400);
    expect((await call('PUT', '/v1/household/budget', { budget: null })).status).toBe(204);
    expect(await (await call('GET', '/v1/household/budget')).json()).toEqual({ budget: null });
  });

  it('refuses an endpoint that is not a push service', async () => {
    const response = await call('PUT', '/v1/push/subscription', {
      endpoint: 'https://example.com/hook',
      keys: DEVICE_KEYS,
      alerts,
    });
    expect(response.status).toBe(400);
  });
});
