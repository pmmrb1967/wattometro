// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Alerts (Phase 4, docs/alerts.md), checked by the Cron every 5 minutes and
 * sent by Web Push (webpush.ts) to the devices that asked for each kind:
 * - stale: no minutes from the Shelly for STALE_MINUTES (and again when it is back);
 * - power: a one-second peak above k × the contracted power, where the smart
 *   meter starts counting towards a cut (src/data/power-trip.json), or above
 *   the contracted power itself, as each device chose; at most one an hour;
 * - tierTrip: at another tier the device chose, the meter would have cut the
 *   power (its curve over the seconds: src/domain/contracted-power.ts); at
 *   most one an hour;
 * - database: D1 has read DATABASE_SHARE of its daily rows; once a UTC day;
 * - cheapHours: tomorrow's cheapest and dearest hours on the market (omie.ts),
 *   once a day when the prices arrive;
 * - reminders, looked at once a Lisbon day from REMINDER_HOUR: eredesImport (the
 *   last E-Redes day over a month old; at most once a month), tariffReview (in
 *   January and July), budget (from day BUDGET_FROM_DAY, the month's pace past
 *   the budget's energy; once a month), unusualDay (yesterday far from the
 *   usual, by the app's own test on the daily totals: src/ml/anomalies.ts),
 *   backup (the household's last copy, made in the app, older than its
 *   reminder's days, or none; again a week later while it lasts).
 *
 * The decisions are pure (decideStale, decidePower, decideDatabase,
 * decideCheapHours, decideEredesImport, decideTariffReview, decideBudget,
 * decideUnusualDay, decideBackup); a
 * condition that lasts is announced once, as alert_state remembers.
 */
import trip from '../../src/data/power-trip.json';
import { isBackupLate } from '../../src/backup/format';
import {
  nearTripEpisodes,
  samplesOf,
  SINGLE_PHASE,
  tripThreshold,
  type NearTripEpisode,
} from '../../src/domain/contracted-power';
import { t } from '../../src/i18n/pt-PT';
import { priceWindows } from '../../src/domain/omie';
import type { Budget } from '../../src/domain/budget';
import { followsTemperature } from '../../src/domain/installation';
import { judgeDay, LOOKBACK_DAYS, type DayTotal } from '../../src/ml/anomalies';
import { formatCents, formatPricePerKwh, omieToMicro } from '../../src/lib/money';
import {
  formatLocalDate,
  formatLisbonTime,
  lisbonDate,
  lisbonDayLength,
  lisbonParts,
  nextDate,
  startOfLisbonDay,
} from '../../src/lib/time';
import { formatKva, formatKwh, formatPower } from '../../src/lib/units';
import {
  breakdownAt,
  MAX_SWITCH_OFF,
  PEAK_WINDOW_S,
  peakSecond,
  switchOff,
  type PeakBreakdown,
  type PeakLoad,
} from '../../src/nilm/at-peak';
import { decodeSecondsRecords, toSeries, type MinuteSeconds } from '../../src/nilm/series';
import type { Appliance } from '../../src/nilm/appliances';
import type { Sql } from './db';
import { MAX_CHANNEL } from './ingest';
import { PUBLISHED_HOUR } from './omie';
import {
  EREDES_METER,
  energyMeters,
  householdDaily,
  lastEredesDay,
  type DailyRow,
} from './repo/eredes';
import { getHouseholdBudget, getHouseholdInstallation } from './repo/households';
import { omieDaysFrom, type StoredOmieDay } from './repo/omie';
import { listDevices } from './repo/devices';
import {
  alertStates,
  forgetEndpoint,
  householdSubscriptions,
  minutePeaksSince,
  peakMinutesSince,
  setAlertState,
  type AlertKind,
  type AlertState,
  type Subscription,
} from './repo/push';
import { listTariffs } from './repo/tariffs';
import { listAppliances } from './repo/appliances';
import { secondsRecords } from './repo/seconds';
import { getBackupState, type BackupState } from './repo/backup';
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
/** While it stays late, the reminder again after this. */
const BACKUP_REPEAT_DAYS = 7;

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

/** A decision whose message depends on each device's choice (the power alerts). */
export interface ChoiceDecision {
  state: AlertState;
  /** By the choice: a percentage of the contracted power, or a tier in VA. */
  messages: Map<number, AlertMessage>;
  /** For each message, the peak it is about, to say what was on then. */
  peaks: Map<number, PeakRef>;
}

/** Which Shelly channel measured a peak. */
export interface MeterRef {
  deviceId: string;
  channel: number;
}

/** A peak a power alert is about: its seconds [from, to), and the limit of that alert. */
export interface PeakRef {
  meter: MeterRef | null;
  from: number;
  to: number;
  /** What to be below: the contracted power, k × it, or k × the simulated tier. */
  limitVa: number;
}

type MinutePeak = { ts: number; peak: number } & Partial<MeterRef>;

const meterOf = (item: Partial<MeterRef>): MeterRef | null =>
  item.deviceId !== undefined && item.channel !== undefined
    ? { deviceId: item.deviceId, channel: item.channel }
    : null;

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

/** The power alert's text for a device that chose `pct` (100 or 120) of the contracted power. */
function powerMessage(
  pct: number,
  highest: { ts: number; peak: number },
  contractedVa: number,
): AlertMessage {
  const time = formatLisbonTime(highest.ts);
  const peak = formatKva(Math.round(highest.peak));
  const contracted = formatKva(contractedVa);
  return {
    title: pct === 100 ? t.alerts.powerOverTitle : t.alerts.powerTitle,
    body:
      pct === 100
        ? t.alerts.powerOverBody(time, peak, contracted)
        : t.alerts.powerBody(
            time,
            peak,
            new Intl.NumberFormat('pt-PT').format(POWER_FACTOR),
            contracted,
          ),
    tag: 'power',
    url: '/potencia',
  };
}

/** The factor of a choice: 120 % is the meter's k (it starts counting there). */
export const powerFactor = (pct: number) => (pct === 100 ? 1 : POWER_FACTOR);

/**
 * `since` is the minute last announced; `checkedUntil` where the minutes were
 * looked at. Each device chose 100 % or 120 % (`choices`): the lowest decides
 * whether there is anything new, and each device is told about its own.
 */
export function decidePower(
  state: AlertState,
  peaks: readonly MinutePeak[],
  contractedVa: number | null,
  now: number,
  choices: readonly number[] = [120],
): ChoiceDecision {
  const checkedUntil = Math.max(state.checkedUntil ?? 0, ...peaks.map((minute) => minute.ts + 60));
  const next = { ...state, checkedUntil };
  const none = { messages: new Map<number, AlertMessage>(), peaks: new Map<number, PeakRef>() };
  if (contractedVa === null || choices.length === 0) return { state: next, ...none };
  const limit = (pct: number) => powerFactor(pct) * contractedVa;
  const lowest = Math.min(...choices.map(limit));
  const over = peaks.filter((minute) => minute.peak > lowest && minute.ts > (state.since ?? 0));
  if (over.length === 0) return { state: next, ...none };
  const quiet = state.sentAt !== null && now - state.sentAt < POWER_QUIET_SECONDS;
  // Announced or not, these minutes are done with.
  const latest = Math.max(...over.map((minute) => minute.ts));
  if (quiet) return { state: { ...next, since: latest }, ...none };
  const messages = new Map<number, AlertMessage>();
  const refs = new Map<number, PeakRef>();
  for (const pct of new Set(choices)) {
    const mine = over.filter((minute) => minute.peak > limit(pct));
    if (mine.length === 0) continue;
    const highest = mine.reduce((best, minute) => (minute.peak > best.peak ? minute : best));
    messages.set(pct, powerMessage(pct, highest, contractedVa));
    refs.set(pct, {
      meter: meterOf(highest),
      from: highest.ts,
      to: highest.ts + 60,
      limitVa: Math.round(limit(pct)),
    });
  }
  return { state: { ...next, active: true, since: latest, sentAt: now }, messages, peaks: refs };
}

/** How far back the tierTrip check runs the curve again: an overload spans Cron runs. */
export const TIER_LOOKBACK_SECONDS = 30 * 60;

/**
 * Overloads that would have cut the power at the tiers the devices chose
 * (`episodes` by tier, from nearTripEpisodes over the last TIER_LOOKBACK_SECONDS).
 * `since` is the start of the last one announced; at most one alert an hour.
 */
export function decideTierTrip(
  state: AlertState,
  episodes: ReadonlyMap<number, readonly (NearTripEpisode & Partial<MeterRef>)[]>,
  now: number,
): ChoiceDecision {
  const next = { ...state, checkedUntil: now };
  const none = { messages: new Map<number, AlertMessage>(), peaks: new Map<number, PeakRef>() };
  const since = state.since ?? 0;
  const fresh = [...episodes]
    .map(
      ([tierVa, list]) =>
        [tierVa, list.filter((item) => item.tripped && item.start > since)] as const,
    )
    .filter(([, list]) => list.length > 0);
  if (fresh.length === 0) return { state: next, ...none };
  const latest = Math.max(...fresh.flatMap(([, list]) => list.map((item) => item.start)));
  const quiet = state.sentAt !== null && now - state.sentAt < POWER_QUIET_SECONDS;
  if (quiet) return { state: { ...next, since: latest }, ...none };
  const messages = new Map<number, AlertMessage>();
  const refs = new Map<number, PeakRef>();
  for (const [tierVa, list] of fresh) {
    const worst = list.reduce((best, item) => (item.peakVa > best.peakVa ? item : best));
    refs.set(tierVa, {
      meter: meterOf(worst),
      from: worst.start,
      to: worst.start + worst.seconds,
      // Below k × the tier, the meter does not count towards a cut.
      limitVa: Math.round(POWER_FACTOR * tierVa),
    });
    messages.set(tierVa, {
      title: t.alerts.tierTripTitle(formatKva(tierVa)),
      body: t.alerts.tierTripBody(
        formatKva(tierVa),
        formatLisbonTime(worst.start),
        formatKva(worst.peakVa),
        worst.seconds,
      ),
      tag: 'tier-trip',
      url: '/potencia',
    });
  }
  return { state: { ...next, active: true, since: latest, sentAt: now }, messages, peaks: refs };
}

/** An appliance as the alert names it: its name(s), or its power and when it went on. */
function loadName(load: PeakLoad): string {
  return load.labels.length > 0
    ? load.labels.join(t.alerts.peakOr)
    : t.alerts.peakUnnamed(formatPower(load.powerW), formatLisbonTime(load.since));
}

/**
 * What the alert adds about the peak: what was probably on, and what to
 * switch off to be below the alert's limit; empty when no appliance was seen.
 */
export function peakText(breakdown: PeakBreakdown, limitVa: number): string {
  if (breakdown.loads.length === 0) return '';
  const shown = breakdown.loads.slice(0, MAX_SWITCH_OFF);
  const listed = shown.map((load) =>
    load.labels.length > 0 ? `${loadName(load)} ${formatPower(load.powerW)}` : loadName(load),
  );
  const parts = [t.alerts.peakLoads(listed.join(', '), formatPower(breakdown.restW))];
  const off = switchOff(breakdown, limitVa);
  if (off) {
    parts.push(
      t.alerts.peakSwitchOff(
        off.loads.map(loadName).join(t.alerts.peakAnd),
        formatKva(off.apparentVa),
        formatKva(limitVa),
      ),
    );
  }
  return parts.join(' ');
}

/** What was on at a peak, from the seconds around it; null without them. */
export async function breakdownOf(
  sql: Sql,
  householdId: string,
  peak: PeakRef,
  appliances: readonly Appliance[],
  now: number,
): Promise<PeakBreakdown | null> {
  if (!peak.meter) return null;
  const from = peak.from - PEAK_WINDOW_S;
  const records = await secondsRecords(
    sql,
    householdId,
    peak.meter.deviceId,
    peak.meter.channel,
    from,
    now + 60,
  );
  let minutes: MinuteSeconds[];
  try {
    minutes = decodeSecondsRecords(records);
  } catch {
    // A format this version does not read: the alert without the appliances.
    return null;
  }
  if (minutes.length === 0) return null;
  const series = toSeries(minutes, from, Math.max(...minutes.map((minute) => minute.ts)) + 60);
  const ts = peakSecond(series, peak.from, peak.to);
  return ts === null ? null : breakdownAt(series, ts, appliances);
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
      // The administrator's panel (docs/admin.md); others land on Definições.
      url: '/definicoes#servidor',
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

/** A day missing more than this (in seconds) is not whole: as the app's forecast (1 h). */
const MAX_MISSING_SECONDS = 3600;

/**
 * The house, one total per whole Lisbon day, oldest first: the Shelly with the
 * most energy (the main board) when it has the day whole, else E-Redes. Like
 * the app's house series (src/domain/consumption.ts, houseQuarters), from the
 * daily totals.
 */
export function houseDays(rows: readonly DailyRow[]): DayTotal[] {
  const byMeter = new Map<string, number>();
  for (const row of rows) {
    if (row.meter !== EREDES_METER) {
      byMeter.set(row.meter, (byMeter.get(row.meter) ?? 0) + row.energyWh);
    }
  }
  const shelly = [...byMeter].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const whole = (row: DailyRow) => {
    const seconds = lisbonDayLength(row.day);
    if (row.meter === EREDES_METER) {
      // 96 is whole on the day of 25 h (the export never has the repeated hour).
      const expected = Math.min(seconds / 900, 96);
      return row.quarters === null || row.quarters * 900 >= expected * 900 - MAX_MISSING_SECONDS;
    }
    return row.minutes !== null && row.minutes * 60 >= seconds - MAX_MISSING_SECONDS;
  };
  const days = new Map<string, { wh: number; fromShelly: boolean }>();
  for (const row of rows) {
    if (!whole(row)) continue;
    const fromShelly = row.meter === shelly;
    if (!fromShelly && row.meter !== EREDES_METER) continue;
    const known = days.get(row.day);
    if (!known || (fromShelly && !known.fromShelly)) {
      days.set(row.day, { wh: row.energyWh, fromShelly });
    }
  }
  return [...days].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, { wh }]) => ({ date, wh }));
}

/**
 * Yesterday far from the usual for its kind of day (the app's own test,
 * judgeDay), once for that day: `since` remembers it. Only for a house whose
 * electricity does not follow the weather: the app then compares with days of
 * a similar temperature, which the Worker does not fetch.
 */
export function decideUnusualDay(
  state: AlertState,
  days: readonly DayTotal[],
  followsWeather: boolean,
  now: number,
): Decision {
  const checked = checkedToday(state, now);
  const yesterday = lisbonDate(startOfLisbonDay(lisbonDate(now)) - 1);
  const index = days.length - 1;
  if (followsWeather || days[index]?.date !== yesterday) return { state: checked, message: null };
  const judged = judgeDay(days, index);
  const day = startOfLisbonDay(yesterday);
  if (!judged || state.since === day) return { state: checked, message: null };
  const actual = days[index]?.wh ?? 0;
  const pct = Math.round((Math.abs(actual - judged.expected) * 100) / judged.expected);
  return {
    state: { ...checked, since: day, sentAt: now },
    message: {
      title: t.anomalies.yesterdayTitle,
      body: `${t.anomalies.sentence(
        t.anomalies.yesterday,
        judged.z > 0 ? 1 : -1,
        pct,
        formatKwh(actual),
        formatKwh(Math.round(judged.expected)),
      )} ${t.alerts.unusualMore}`,
      tag: 'unusual-day',
      url: '/consumo#fora-do-habitual',
    },
  };
}

/**
 * The household's last copy (Definições › Dados, docs/backup.md) older than the
 * reminder's days, or none yet: at once, then every BACKUP_REPEAT_DAYS while it
 * lasts. A reminder of 0 days: never.
 */
export function decideBackup(state: AlertState, backup: BackupState, now: number): Decision {
  const checked = checkedToday(state, now);
  const backupAt = backup.lastAt;
  const late = isBackupLate(backupAt, backup.remindDays, now);
  if (!late) return { state: { ...checked, active: false }, message: null };
  if (state.active && state.sentAt !== null && now - state.sentAt < BACKUP_REPEAT_DAYS * DAY) {
    return { state: { ...checked, active: true }, message: null };
  }
  return {
    state: { ...checked, active: true, since: state.active ? state.since : now, sentAt: now },
    message: {
      title: t.alerts.backupTitle,
      body:
        backupAt === null
          ? t.alerts.backupNeverBody
          : t.alerts.backupBody(Math.floor((now - backupAt) / DAY)),
      tag: 'backup',
      url: '/definicoes#dados',
    },
  };
}

export interface AlertConfig {
  vapid: VapidKeys;
  rowsReadLimit: number;
  fetcher?: Fetcher;
}

async function deliverTo(
  sql: Sql,
  subscriptions: readonly Subscription[],
  message: AlertMessage,
  config: AlertConfig,
  now: number,
): Promise<void> {
  for (const subscription of subscriptions) {
    const result = await sendPush(subscription, message, config.vapid, now, config.fetcher);
    if (result === 'gone') await forgetEndpoint(sql, subscription.endpoint);
  }
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
  /** The power alerts: each device gets the message of its own choice. */
  const choiceDecisions: [AlertKind, ChoiceDecision, (item: Subscription) => number | null][] = [];

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
    const powerChoice = (item: Subscription) => (item.alerts.power ? item.options.powerPct : null);
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
    const choices = subscriptions.flatMap((item) => powerChoice(item) ?? []);
    choiceDecisions.push([
      'power',
      decidePower(states.power, peaks, tariff?.powerVa ?? null, now, choices),
      powerChoice,
    ]);
  }

  const tierChoice = (item: Subscription) =>
    item.alerts.tierTrip && item.options.tierVa !== null ? item.options.tierVa : null;
  const tiers = [...new Set(subscriptions.flatMap((item) => tierChoice(item) ?? []))];
  if (tiers.length > 0) {
    const from = Math.max(states.tierTrip.checkedUntil ?? now, now - DAY) - TIER_LOOKBACK_SECONDS;
    // Below the lowest tier's k × Sc no second counts towards a cut.
    const threshold = Math.min(...tiers.map((tierVa) => tripThreshold(tierVa, 0, SINGLE_PHASE)));
    const episodes = new Map<number, (NearTripEpisode & MeterRef)[]>(
      tiers.map((tierVa) => [tierVa, []]),
    );
    for (const device of devices) {
      for (let channel = 0; channel <= MAX_CHANNEL; channel++) {
        const minutes = await peakMinutesSince(
          sql,
          householdId,
          device.id,
          channel,
          from,
          threshold,
        );
        // Only the seconds as measured: a minute's peak held for 60 s would cut too often.
        const { samples } = samplesOf(minutes.filter((minute) => minute.seconds !== null));
        if (samples.length === 0) continue;
        for (const tierVa of tiers) {
          episodes.get(tierVa)?.push(
            ...nearTripEpisodes(samples, tierVa, SINGLE_PHASE).map((item) => ({
              ...item,
              deviceId: device.id,
              channel,
            })),
          );
        }
      }
    }
    choiceDecisions.push(['tierTrip', decideTierTrip(states.tierTrip, episodes, now), tierChoice]);
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

  if (wants('unusualDay') && reminderDue(states.unusualDay, now)) {
    const installation = await getHouseholdInstallation(sql, householdId);
    const follows = followsTemperature(installation);
    let days: DayTotal[] = [];
    if (!follows) {
      const today = lisbonDate(now);
      const from = lisbonDate(startOfLisbonDay(today) - (LOOKBACK_DAYS + 1) * DAY);
      days = houseDays(await householdDaily(sql, householdId, from, today));
      // Today, still going, is never whole; drop it in case the minutes say otherwise.
      days = days.filter((day) => day.date < today);
    }
    decisions.push(['unusualDay', decideUnusualDay(states.unusualDay, days, follows, now)]);
  }

  if (wants('backup') && reminderDue(states.backup, now)) {
    const backup = await getBackupState(sql, householdId);
    decisions.push(['backup', decideBackup(states.backup, backup, now)]);
  }

  for (const [kind, decision] of decisions) {
    if (decision.message) await deliver(sql, subscriptions, kind, decision.message, config, now);
    if (JSON.stringify(decision.state) !== JSON.stringify(states[kind])) {
      await setAlertState(sql, householdId, kind, decision.state);
    }
  }
  let appliances: Appliance[] | null = null;
  const breakdowns = new Map<string, PeakBreakdown | null>();
  for (const [kind, decision, choice] of choiceDecisions) {
    for (const [key, message] of decision.messages) {
      const to = subscriptions.filter((item) => choice(item) === key);
      let body = message.body;
      const peak = decision.peaks.get(key);
      if (peak && to.length > 0) {
        // Read once a run (at most one power alert an hour), for every message of the same peak.
        const id = `${peak.meter?.deviceId}:${peak.meter?.channel}:${peak.from}:${peak.to}`;
        if (!breakdowns.has(id)) {
          appliances ??= await listAppliances(sql, householdId);
          breakdowns.set(id, await breakdownOf(sql, householdId, peak, appliances, now));
        }
        const breakdown = breakdowns.get(id);
        const extra = breakdown ? peakText(breakdown, peak.limitVa) : '';
        if (extra) body = `${body} ${extra}`;
      }
      await deliverTo(sql, to, { ...message, body }, config, now);
    }
    if (JSON.stringify(decision.state) !== JSON.stringify(states[kind])) {
      await setAlertState(sql, householdId, kind, decision.state);
    }
  }
}
