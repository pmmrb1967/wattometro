// SPDX-License-Identifier: AGPL-3.0-or-later
/** push_subscriptions and alert_state (migrations 0015, 0019, 0020, 0023). */
import type { Sql } from '../db';

export type AlertKind =
  | 'stale'
  | 'power'
  | 'database'
  | 'cheapHours'
  | 'eredesImport'
  | 'tariffReview'
  | 'budget'
  | 'unusualDay';
export const ALERT_KINDS: readonly AlertKind[] = [
  'stale',
  'power',
  'database',
  'cheapHours',
  'eredesImport',
  'tariffReview',
  'budget',
  'unusualDay',
];

export type AlertChoice = Record<AlertKind, boolean>;

export interface Subscription {
  endpoint: string;
  p256dh: string;
  auth: string;
  alerts: AlertChoice;
}

interface SubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
  alert_stale: number;
  alert_power: number;
  alert_database: number;
  alert_cheap_hours: number;
  alert_eredes_import: number;
  alert_tariff_review: number;
  alert_budget: number;
  alert_unusual_day: number;
}

const fromRow = (row: SubscriptionRow): Subscription => ({
  endpoint: row.endpoint,
  p256dh: row.p256dh,
  auth: row.auth,
  alerts: {
    stale: row.alert_stale === 1,
    power: row.alert_power === 1,
    database: row.alert_database === 1,
    cheapHours: row.alert_cheap_hours === 1,
    eredesImport: row.alert_eredes_import === 1,
    tariffReview: row.alert_tariff_review === 1,
    budget: row.alert_budget === 1,
    unusualDay: row.alert_unusual_day === 1,
  },
});

const COLUMNS =
  'endpoint, p256dh, auth, alert_stale, alert_power, alert_database, alert_cheap_hours, ' +
  'alert_eredes_import, alert_tariff_review, alert_budget, alert_unusual_day';

/** Saves this browser's subscription for the user; the same endpoint again replaces it. */
export async function saveSubscription(
  sql: Sql,
  user: { id: string; householdId: string },
  subscription: Subscription,
  now: number,
): Promise<void> {
  const { alerts } = subscription;
  await sql.run(
    `INSERT INTO push_subscriptions (endpoint, household_id, user_id, p256dh, auth,
       alert_stale, alert_power, alert_database, alert_cheap_hours, alert_eredes_import,
       alert_tariff_review, alert_budget, alert_unusual_day, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (endpoint) DO UPDATE SET household_id = excluded.household_id,
       user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
       alert_stale = excluded.alert_stale, alert_power = excluded.alert_power,
       alert_database = excluded.alert_database, alert_cheap_hours = excluded.alert_cheap_hours,
       alert_eredes_import = excluded.alert_eredes_import,
       alert_tariff_review = excluded.alert_tariff_review, alert_budget = excluded.alert_budget,
       alert_unusual_day = excluded.alert_unusual_day`,
    subscription.endpoint,
    user.householdId,
    user.id,
    subscription.p256dh,
    subscription.auth,
    alerts.stale ? 1 : 0,
    alerts.power ? 1 : 0,
    alerts.database ? 1 : 0,
    alerts.cheapHours ? 1 : 0,
    alerts.eredesImport ? 1 : 0,
    alerts.tariffReview ? 1 : 0,
    alerts.budget ? 1 : 0,
    alerts.unusualDay ? 1 : 0,
    now,
  );
}

/** The user's own subscription at this endpoint (never another user's). */
export async function findSubscription(
  sql: Sql,
  user: { id: string },
  endpoint: string,
): Promise<Subscription | null> {
  const row = await sql.first<SubscriptionRow>(
    `SELECT ${COLUMNS} FROM push_subscriptions WHERE endpoint = ? AND user_id = ?`,
    endpoint,
    user.id,
  );
  return row ? fromRow(row) : null;
}

export async function deleteSubscription(
  sql: Sql,
  user: { id: string },
  endpoint: string,
): Promise<void> {
  await sql.run(
    'DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?',
    endpoint,
    user.id,
  );
}

/** A subscription the push service says is gone (the browser unsubscribed). */
export async function forgetEndpoint(sql: Sql, endpoint: string): Promise<void> {
  await sql.run('DELETE FROM push_subscriptions WHERE endpoint = ?', endpoint);
}

export async function householdSubscriptions(
  sql: Sql,
  householdId: string,
): Promise<Subscription[]> {
  const rows = await sql.all<SubscriptionRow>(
    `SELECT ${COLUMNS} FROM push_subscriptions WHERE household_id = ?`,
    householdId,
  );
  return rows.map(fromRow);
}

export interface AlertState {
  active: boolean;
  since: number | null;
  checkedUntil: number | null;
  sentAt: number | null;
}

export const QUIET_STATE: AlertState = {
  active: false,
  since: null,
  checkedUntil: null,
  sentAt: null,
};

export async function alertStates(
  sql: Sql,
  householdId: string,
): Promise<Record<AlertKind, AlertState>> {
  const rows = await sql.all<{
    kind: AlertKind;
    active: number;
    since: number | null;
    checked_until: number | null;
    sent_at: number | null;
  }>(
    'SELECT kind, active, since, checked_until, sent_at FROM alert_state WHERE household_id = ?',
    householdId,
  );
  const states = {
    stale: QUIET_STATE,
    power: QUIET_STATE,
    database: QUIET_STATE,
    cheapHours: QUIET_STATE,
    eredesImport: QUIET_STATE,
    tariffReview: QUIET_STATE,
    budget: QUIET_STATE,
    unusualDay: QUIET_STATE,
  };
  for (const row of rows) {
    states[row.kind] = {
      active: row.active === 1,
      since: row.since,
      checkedUntil: row.checked_until,
      sentAt: row.sent_at,
    };
  }
  return states;
}

export async function setAlertState(
  sql: Sql,
  householdId: string,
  kind: AlertKind,
  state: AlertState,
): Promise<void> {
  await sql.run(
    `INSERT INTO alert_state (household_id, kind, active, since, checked_until, sent_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (household_id, kind) DO UPDATE SET active = excluded.active,
       since = excluded.since, checked_until = excluded.checked_until, sent_at = excluded.sent_at`,
    householdId,
    kind,
    state.active ? 1 : 0,
    state.since,
    state.checkedUntil,
    state.sentAt,
  );
}

/**
 * The minutes of the household's active devices from `from` on, with their
 * one-second peak (apparent VA where known, else active W). By primary key,
 * one device and channel at a time: a few rows per Cron run.
 */
export async function minutePeaksSince(
  sql: Sql,
  householdId: string,
  deviceIds: readonly string[],
  channels: number,
  from: number,
): Promise<{ ts: number; peak: number }[]> {
  const peaks: { ts: number; peak: number }[] = [];
  for (const deviceId of deviceIds) {
    for (let channel = 0; channel < channels; channel++) {
      peaks.push(
        ...(await sql.all<{ ts: number; peak: number }>(
          `SELECT ts, COALESCE(apparent_max_va, power_max_w) AS peak FROM readings_1m
           WHERE device_id = ? AND channel = ? AND ts >= ? AND household_id = ?`,
          deviceId,
          channel,
          from,
          householdId,
        )),
      );
    }
  }
  return peaks;
}
