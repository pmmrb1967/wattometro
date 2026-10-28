// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Alerts (Phase 4, docs/alerts.md), checked by the Cron every 5 minutes and
 * sent by Web Push (webpush.ts) to the devices that asked for each kind:
 * - stale: no minutes from the Shelly for STALE_MINUTES (and again when it is back);
 * - power: a one-second peak above k × the contracted power, where the smart
 *   meter starts counting towards a cut (src/data/power-trip.json); at most
 *   one an hour;
 * - database: D1 has read DATABASE_SHARE of its daily rows; once a UTC day;
 * - cheapHours: tomorrow's cheapest and dearest hours on the market (omie.ts),
 *   once a day when the prices arrive;
 * - reminders, looked at once a Lisbon day from REMINDER_HOUR: eredesImport (the
 *   last E-Redes day over a month old; at most once a month), tariffReview (in
 *   January and July), budget (from day BUDGET_FROM_DAY, the month's pace past
 *   the budget's energy; once a month).
 *
 * The decisions are pure (decideStale, decidePower, decideDatabase,
 * decideCheapHours, decideEredesImport, decideTariffReview, decideBudget); a
 * condition that lasts is announced once, as alert_state remembers.
 */
import trip from '../../src/data/power-trip.json';
import { t } from '../../src/i18n/pt-PT';
import { priceWindows } from '../../src/domain/omie';
import type { Budget } from '../../src/domain/budget';
import { formatCents, formatPricePerKwh, omieToMicro } from '../../src/lib/money';
import {
  formatLocalDate,
  formatLisbonTime,
  lisbonDate,
  lisbonParts,
  nextDate,
  startOfLisbonDay,
} from '../../src/lib/time';
import { formatKva } from '../../src/lib/units';
import type { Sql } from './db';
import { MAX_CHANNEL } from './ingest';
import { PUBLISHED_HOUR } from './omie';
import { energyMeters, lastEredesDay } from './repo/eredes';
import { getHouseholdBudget } from './repo/households';
import { omieDaysFrom, type StoredOmieDay } from './repo/omie';
import { listDevices } from './repo/devices';
import {
  alertStates,
  forgetEndpoint,
  householdSubscriptions,
  minutePeaksSince,
  setAlertState,
  type AlertKind,
  type AlertState,
  type Subscription,
} from './repo/push';
import { listTariffs } from './repo/tariffs';
import { rowsReadOn, utcDay } from './repo/usage';
import { sendPush, type Fetcher, type VapidKeys } from './webpush';

export const STALE_MINUTES = 15;
export const POWER_FACTOR = trip.kSinglePhase;
export const POWER_QUIET_SECONDS = 3600;
export const DATABASE_SHARE = 0.8;
/** How far back the power check looks again, for minutes the Shelly sends late. */
const POWER_LOOKBACK_SECONDS = 10 * 60;
const DAY = 86_400;
/** Reminders wait for this Lisbon hour: not at night. */
export const REMINDER_HOUR = 10;
/** The E-Redes data is old when its last day is this far behind. */
export const EREDES_STALE_DAYS = 31;
/** The month's pace is too uncertain before this day. */
export const BUDGET_FROM_DAY = 7;

export interface AlertMessage {
  title: string;
  body: string;
  /** Same tag, same notification: a newer one replaces it. */
  tag: string;
  /** The page the notification opens. */
  url: string;
}

interface Decision {
  state: AlertState;
  message: AlertMessage | null;
}

export function decideStale(
  state: AlertState,
  device: { name: string; lastSeenAt: number } | null,
  now: number,
  staleMinutes = STALE_MINUTES,
): Decision {
  if (!device) return { state, message: null };
  const silent = now - device.lastSeenAt >= staleMinutes * 60;
  if (silent && !state.active) {
    return {
      state: { ...state, active: true, since: device.lastSeenAt, sentAt: now },
      message: {
        title: t.alerts.staleTitle,
        body: t.alerts.staleBody(device.name, formatLisbonTime(device.lastSeenAt)),
        tag: 'stale',
        url: '/definicoes',
      },
    };
  }
  if (!silent && state.active) {
    return {
      state: { ...state, active: false, sentAt: now },
      message: {
        title: t.alerts.backTitle,
        body: t.alerts.backBody(device.name, formatLisbonTime(device.lastSeenAt)),
        tag: 'stale',
        url: '/',
      },
    };
  }
  return { state, message: null };
}

/** `since` is the minute last announced; `checkedUntil` where the minutes were looked at. */
export function decidePower(
  state: AlertState,
  peaks: readonly { ts: number; peak: number }[],
  contractedVa: number | null,
  now: number,
): Decision {
  const checkedUntil = Math.max(state.checkedUntil ?? 0, ...peaks.map((minute) => minute.ts + 60));
  const next = { ...state, checkedUntil };
  if (contractedVa === null) return { state: next, message: null };
  const limit = POWER_FACTOR * contractedVa;
  const over = peaks.filter((minute) => minute.peak > limit && minute.ts > (state.since ?? 0));
  if (over.length === 0) return { state: next, message: null };
  const quiet = state.sentAt !== null && now - state.sentAt < POWER_QUIET_SECONDS;
  const highest = over.reduce((best, minute) => (minute.peak > best.peak ? minute : best));
  // Announced or not, these minutes are done with.
  const latest = Math.max(...over.map((minute) => minute.ts));
  if (quiet) return { state: { ...next, since: latest }, message: null };
  return {
    state: { ...next, active: true, since: latest, sentAt: now },
    message: {
      title: t.alerts.powerTitle,
      body: t.alerts.powerBody(
        formatLisbonTime(highest.ts),
        formatKva(Math.round(highest.peak)),
        new Intl.NumberFormat('pt-PT').format(POWER_FACTOR),
        formatKva(contractedVa),
      ),
      tag: 'power',
      url: '/potencia',
    },
  };
}

export function decideDatabase(
  state: AlertState,
  rowsRead: number,
  limit: number,
  now: number,
): Decision {
  const over = rowsRead >= DATABASE_SHARE * limit;
  if (!over) return { state: { ...state, active: false }, message: null };
  const sentToday = state.sentAt !== null && utcDay(state.sentAt) === utcDay(now);
  if (sentToday) return { state: { ...state, active: true }, message: null };
  const resetsAt = (Math.floor(now / DAY) + 1) * DAY;
  return {
    state: { ...state, active: true, since: now, sentAt: now },
    message: {
      title: t.alerts.databaseTitle,
      body: t.alerts.databaseBody(Math.floor((100 * rowsRead) / limit), formatLisbonTime(resetsAt)),
      tag: 'database',
      url: '/definicoes',
    },
  };
}

const perKwh = (centsPerMwh: number) => formatPricePerKwh(omieToMicro(centsPerMwh));

/**
 * Tomorrow's cheapest and dearest hours, once: `since` remembers the day
 * announced (its Lisbon midnight). Null `tomorrow`: not published yet.
 */
export function decideCheapHours(
  state: AlertState,
  tomorrow: StoredOmieDay | null,
  now: number,
): Decision {
  const quiet = { state, message: null };
  if (!tomorrow || lisbonParts(now).hour < PUBLISHED_HOUR) return quiet;
  const midnight = startOfLisbonDay(tomorrow.date);
  if (state.since === midnight) return quiet;
  const windows = priceWindows(tomorrow.start, tomorrow.prices, midnight);
  if (!windows) return quiet;
  const { cheapest, dearest } = windows;
  return {
    state: { active: false, since: midnight, checkedUntil: null, sentAt: now },
    message: {
      title: t.alerts.cheapTitle,
      body: t.alerts.cheapBody(
        formatLisbonTime(cheapest.from),
        formatLisbonTime(cheapest.to),
        perKwh(cheapest.average),
        formatLisbonTime(dearest.from),
        formatLisbonTime(dearest.to),
        perKwh(dearest.average),
      ),
      tag: 'cheap-hours',
      url: '/tarifarios#amanha',
    },
  };
}

/** A reminder is looked at once a Lisbon day, from REMINDER_HOUR. */
export function reminderDue(state: AlertState, now: number): boolean {
  if (lisbonParts(now).hour < REMINDER_HOUR) return false;
  return state.checkedUntil !== startOfLisbonDay(lisbonDate(now));
}

const checkedToday = (state: AlertState, now: number): AlertState => ({
  ...state,
  checkedUntil: startOfLisbonDay(lisbonDate(now)),
});

/** The last imported E-Redes day over a month old: at most once a month. Null: never imported. */
export function decideEredesImport(
  state: AlertState,
  lastDay: string | null,
  now: number,
): Decision {
  const checked = checkedToday(state, now);
  const behind = lastDay === null ? 0 : (checked.checkedUntil ?? 0) - startOfLisbonDay(lastDay);
  if (lastDay === null || behind <= EREDES_STALE_DAYS * DAY) {
    return { state: { ...checked, active: false }, message: null };
  }
  if (state.sentAt !== null && now - state.sentAt < 30 * DAY) {
    return { state: { ...checked, active: true }, message: null };
  }
  return {
    state: { ...checked, active: true, since: state.active ? state.since : now, sentAt: now },
    message: {
      title: t.alerts.eredesTitle,
      body: t.alerts.eredesBody(formatLocalDate(lastDay)),
      tag: 'eredes-import',
      url: '/definicoes#dados',
    },
  };
}

/** In January and in July, once: `since` remembers the month announced. */
export function decideTariffReview(state: AlertState, now: number): Decision {
  const { year, month } = lisbonParts(now);
  const checked = checkedToday(state, now);
  if (month !== 1 && month !== 7) return { state: checked, message: null };
  const monthStart = startOfLisbonDay(`${year}-${String(month).padStart(2, '0')}-01`);
  if (state.since === monthStart) return { state: checked, message: null };
  return {
    state: { ...checked, since: monthStart, sentAt: now },
    message: {
      title: t.alerts.reviewTitle,
      body: t.alerts.reviewBody,
      tag: 'tariff-review',
      url: '/tarifarios',
    },
  };
}

/**
 * The month's energy so far, at its pace, past what the budget buys: once a
 * month, from day BUDGET_FROM_DAY. `since` remembers the month announced.
 */
export function decideBudget(
  state: AlertState,
  budget: Budget | null,
  monthEnergyWh: number,
  now: number,
): Decision {
  const checked = checkedToday(state, now);
  const { year, month, day } = lisbonParts(now);
  if (!budget || day < BUDGET_FROM_DAY)
    return { state: { ...checked, active: false }, message: null };
  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  const monthStart = startOfLisbonDay(first);
  const nextMonth =
    month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const monthEnd = startOfLisbonDay(nextMonth);
  const days = Math.round((monthEnd - monthStart) / DAY);
  const projected = (monthEnergyWh * (monthEnd - monthStart)) / Math.max(now - monthStart, 1);
  const over = projected > budget.whPerDay * days;
  if (!over || state.since === monthStart) {
    return { state: { ...checked, active: over }, message: null };
  }
  return {
    state: { ...checked, active: true, since: monthStart, sentAt: now },
    message: {
      title: t.alerts.budgetTitle,
      body: t.alerts.budgetBody(formatCents(budget.cents)),
      tag: 'budget',
      url: '/consumo#previsao',
    },
  };
}

export interface AlertConfig {
  vapid: VapidKeys;
  rowsReadLimit: number;
  fetcher?: Fetcher;
}

async function deliver(
  sql: Sql,
  subscriptions: readonly Subscription[],
  kind: AlertKind,
  message: AlertMessage,
  config: AlertConfig,
  now: number,
): Promise<void> {
  for (const subscription of subscriptions) {
    if (!subscription.alerts[kind]) continue;
    const result = await sendPush(subscription, message, config.vapid, now, config.fetcher);
    if (result === 'gone') await forgetEndpoint(sql, subscription.endpoint);
  }
}

/** One Cron run for one household; nothing is read for a household without subscriptions. */
export async function checkAlerts(
  sql: Sql,
  householdId: string,
  now: number,
  config: AlertConfig,
): Promise<void> {
  const subscriptions = await householdSubscriptions(sql, householdId);
  if (subscriptions.length === 0) return;
  const states = await alertStates(sql, householdId);
  const wants = (kind: AlertKind) => subscriptions.some((item) => item.alerts[kind]);
  const decisions: [AlertKind, Decision][] = [];

  const devices = (await listDevices(sql, householdId)).filter(
    (device) => device.revokedAt === null,
  );
  if (wants('stale')) {
    const seen = devices
      .filter((device) => device.lastSeenAt !== null)
      .map((device) => ({ name: device.name, lastSeenAt: device.lastSeenAt as number }))
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
    decisions.push(['stale', decideStale(states.stale, seen[0] ?? null, now)]);
  }

  if (wants('power')) {
    const today = lisbonDate(now);
    const tariff = (await listTariffs(sql, householdId))
      .filter((item) => item.validFrom <= today)
      .at(-1);
    const from =
      Math.max(states.power.checkedUntil ?? now - POWER_LOOKBACK_SECONDS, now - DAY) -
      POWER_LOOKBACK_SECONDS;
    const peaks = await minutePeaksSince(
      sql,
      householdId,
      devices.map((device) => device.id),
      MAX_CHANNEL + 1,
      from,
    );
    decisions.push(['power', decidePower(states.power, peaks, tariff?.powerVa ?? null, now)]);
  }

  if (wants('database')) {
    const rowsRead = await rowsReadOn(sql, utcDay(now));
    decisions.push([
      'database',
      decideDatabase(states.database, rowsRead, config.rowsReadLimit, now),
    ]);
  }

  if (wants('cheapHours')) {
    const tomorrow = nextDate(lisbonDate(now));
    const day = (await omieDaysFrom(sql, tomorrow)).find((item) => item.date === tomorrow);
    decisions.push(['cheapHours', decideCheapHours(states.cheapHours, day ?? null, now)]);
  }

  if (wants('eredesImport') && reminderDue(states.eredesImport, now)) {
    const lastDay = await lastEredesDay(sql, householdId);
    decisions.push(['eredesImport', decideEredesImport(states.eredesImport, lastDay, now)]);
  }

  if (wants('tariffReview') && reminderDue(states.tariffReview, now)) {
    decisions.push(['tariffReview', decideTariffReview(states.tariffReview, now)]);
  }

  if (wants('budget') && reminderDue(states.budget, now)) {
    const budget = await getHouseholdBudget(sql, householdId);
    let monthEnergyWh = 0;
    if (budget) {
      const today = lisbonDate(now);
      // The house: the meter with the most energy this month (E-Redes lags, a circuit is less).
      const meters = await energyMeters(sql, householdId, `${today.slice(0, 7)}-01`, today);
      monthEnergyWh = Math.max(0, ...meters.map((item) => item.energyWh));
    }
    decisions.push(['budget', decideBudget(states.budget, budget, monthEnergyWh, now)]);
  }

  for (const [kind, decision] of decisions) {
    if (decision.message) await deliver(sql, subscriptions, kind, decision.message, config, now);
    if (JSON.stringify(decision.state) !== JSON.stringify(states[kind])) {
      await setAlertState(sql, householdId, kind, decision.state);
    }
  }
}
