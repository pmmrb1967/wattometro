// SPDX-License-Identifier: AGPL-3.0-or-later
import type { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { tariffInputSchema } from '../../src/domain/tariff';
import { memorySql } from '../test/sqlite';
import { checkAlerts, decideDatabase, decidePower, decideStale, type AlertMessage } from './alerts';
import { createApp } from './app';
import { toBase64Url } from './base64url';
import type { Sql } from './db';
import { hashPassword } from './password';
import { createDevice } from './repo/devices';
import { createHousehold } from './repo/households';
import { minuteStatements } from './repo/readings';
import { QUIET_STATE, saveSubscription } from './repo/push';
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
      'Às 17:57 chegaste a 8,4 kVA, acima de 1,2 × a potência contratada (6,9 kVA): o contador começou a contar para cortar a luz.',
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
  const subscribe = (alerts = { stale: true, power: true, database: true }) =>
    saveSubscription(sql, user, { endpoint: ENDPOINT, ...DEVICE_KEYS, alerts }, NOW);

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
    await subscribe({ stale: false, power: true, database: false });
    seen(NOW - 20 * 60);
    await addRowsRead(sql, utcDay(NOW), 4_500_000);
    await checkAlerts(sql, household, NOW, {
      vapid: await vapid(),
      rowsReadLimit: 5_000_000,
      fetcher,
    });
    expect(sent).toHaveLength(0);
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
  const alerts = { stale: true, power: false, database: true };

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

  it('refuses an endpoint that is not a push service', async () => {
    const response = await call('PUT', '/v1/push/subscription', {
      endpoint: 'https://example.com/hook',
      keys: DEVICE_KEYS,
      alerts,
    });
    expect(response.status).toBe(400);
  });
});
