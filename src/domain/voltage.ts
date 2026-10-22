// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Power quality from the Shelly's data, against the limits in docs/voltage.md
 * (src/data/voltage.json). Facts only: episodes, weekly shares, outages per year.
 *
 * - Episode: consecutive minutes whose lowest (or highest) voltage left the ± 10 % band.
 * - Week (NP EN 50160): Lisbon Monday to Sunday; 10-minute values within ± 10 % at
 *   least 95 % of the time and within + 10 % / − 15 % always. 10-minute values that
 *   overlap an outage are left out, as the operator does.
 * - Outage: from the end of the last minute before a Shelly boot to the boot;
 *   long when over 3 minutes. Overlapping outages seen by several Shellys count once.
 */
import data from '../data/voltage.json';
import {
  lisbonDate,
  lisbonParts,
  startOfLisbonDay,
  type EpochSeconds,
  type LocalDate,
} from '../lib/time';
import type { Decivolts } from '../lib/units';

export interface VoltageLimits {
  nominalDv: Decivolts;
  /** Lower and upper ends of the ± 10 % band. */
  lowDv: Decivolts;
  highDv: Decivolts;
  /** − 15 %: no 10-minute value may be below it. */
  floorDv: Decivolts;
  weeklySharePct: number;
  intervalSeconds: number;
}

const percentOf = (value: number, pct: number) => Math.round((value * pct) / 100);

export const VOLTAGE_LIMITS: VoltageLimits = {
  nominalDv: data.nominalDv,
  lowDv: data.nominalDv - percentOf(data.nominalDv, data.bandPct),
  highDv: data.nominalDv + percentOf(data.nominalDv, data.bandPct),
  floorDv: data.nominalDv - percentOf(data.nominalDv, data.lowerLimitPct),
  weeklySharePct: data.weeklySharePct,
  intervalSeconds: data.intervalSeconds,
};

export const SHORT_INTERRUPTION_MAX_SECONDS = data.shortInterruptionMaxSeconds;

export type QualityZone = keyof typeof data.zones;
export const QUALITY_ZONES = Object.keys(data.zones) as QualityZone[];

/** Individual standard per year and client, low voltage (RQS, Anexo I C). */
export function zoneStandard(zone: QualityZone): { interruptions: number; hours: number } {
  return data.zones[zone];
}

const MINUTE = 60;

export interface MinuteVoltage {
  ts: EpochSeconds;
  minDv: Decivolts;
  maxDv: Decivolts;
}

export interface VoltageEpisode {
  kind: 'low' | 'high';
  /** Start of the first minute and end of the last one. */
  start: EpochSeconds;
  end: EpochSeconds;
  minutes: number;
  /** Lowest voltage of a 'low' episode, highest of a 'high' one. */
  extremeDv: Decivolts;
}

/** Episodes of at least `minMinutes` consecutive minutes outside the band, by start. */
export function voltageEpisodes(
  minutes: readonly MinuteVoltage[],
  limits: VoltageLimits,
  minMinutes: number,
): VoltageEpisode[] {
  const sorted = [...minutes].sort((a, b) => a.ts - b.ts);
  const episodes: VoltageEpisode[] = [];
  for (const kind of ['low', 'high'] as const) {
    let open: VoltageEpisode | null = null;
    for (const minute of sorted) {
      const value = kind === 'low' ? minute.minDv : minute.maxDv;
      const outside = kind === 'low' ? value < limits.lowDv : value > limits.highDv;
      if (outside && open && open.end === minute.ts) {
        open.end += MINUTE;
        open.minutes += 1;
        open.extremeDv =
          kind === 'low' ? Math.min(open.extremeDv, value) : Math.max(open.extremeDv, value);
        continue;
      }
      if (open && open.minutes >= minMinutes) episodes.push(open);
      open = outside
        ? { kind, start: minute.ts, end: minute.ts + MINUTE, minutes: 1, extremeDv: value }
        : null;
    }
    if (open && open.minutes >= minMinutes) episodes.push(open);
  }
  return episodes.sort((a, b) => a.start - b.start || a.kind.localeCompare(b.kind));
}

export interface Interval {
  /** Start of the 10 minutes. */
  ts: EpochSeconds;
  avgDv: Decivolts;
}

export interface Span {
  start: EpochSeconds;
  end: EpochSeconds;
}

export interface WeekCompliance {
  /** Monday of the week (Lisbon). */
  week: LocalDate;
  /** 10-minute intervals in the week (1008; 1002 or 1014 when the clocks change). */
  expected: number;
  /** Intervals with data, not touched by an outage: the ones evaluated. */
  evaluated: number;
  /** Intervals with data left out because of an outage. */
  excluded: number;
  /** Evaluated intervals outside ± 10 %. */
  outsideBand: number;
  /** Evaluated intervals below − 15 % or above + 10 %. */
  outsideLimits: number;
  /** At most 5 % of the evaluated intervals outside ± 10 %. */
  meetsBand: boolean;
  /** None below − 15 % or above + 10 %. */
  meetsLimits: boolean;
}

/** The Monday on or before a Lisbon date. */
export function mondayOf(date: LocalDate): LocalDate {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const utc = new Date(Date.UTC(year, month - 1, day));
  const back = (utc.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(year, month - 1, day - back)).toISOString().slice(0, 10);
}

const addDays = (date: LocalDate, days: number) => {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
};

export function weeklyCompliance(
  intervals: readonly Interval[],
  outages: readonly Span[],
  limits: VoltageLimits,
): WeekCompliance[] {
  const weeks = new Map<LocalDate, WeekCompliance>();
  for (const interval of intervals) {
    const week = mondayOf(lisbonDate(interval.ts));
    let entry = weeks.get(week);
    if (!entry) {
      const seconds = startOfLisbonDay(addDays(week, 7)) - startOfLisbonDay(week);
      entry = {
        week,
        expected: seconds / limits.intervalSeconds,
        evaluated: 0,
        excluded: 0,
        outsideBand: 0,
        outsideLimits: 0,
        meetsBand: true,
        meetsLimits: true,
      };
      weeks.set(week, entry);
    }
    const end = interval.ts + limits.intervalSeconds;
    if (outages.some((outage) => outage.start < end && outage.end > interval.ts)) {
      entry.excluded += 1;
      continue;
    }
    entry.evaluated += 1;
    if (interval.avgDv < limits.lowDv || interval.avgDv > limits.highDv) entry.outsideBand += 1;
    if (interval.avgDv < limits.floorDv || interval.avgDv > limits.highDv) entry.outsideLimits += 1;
  }
  return [...weeks.values()]
    .map((week) => ({
      ...week,
      meetsBand: week.outsideBand * 100 <= (100 - limits.weeklySharePct) * week.evaluated,
      meetsLimits: week.outsideLimits === 0,
    }))
    .sort((a, b) => a.week.localeCompare(b.week));
}

export interface Boot {
  deviceId: string;
  bootAt: EpochSeconds;
  startAt: EpochSeconds | null;
  excluded: boolean;
}

export interface Outage extends Span {
  /** The Shellys that saw it (one boot each). */
  boots: { deviceId: string; bootAt: EpochSeconds }[];
  seconds: number;
  long: boolean;
  excluded: boolean;
}

/**
 * Outages from the Shelly boots: a boot without an earlier minute is not one.
 * Boots whose outages overlap (several Shellys) become one outage; it is excluded
 * only when every one of its boots is.
 */
export function outagesFromBoots(boots: readonly Boot[]): Outage[] {
  const spans = boots
    .filter((boot) => boot.startAt !== null && boot.startAt < boot.bootAt)
    .map((boot) => ({ boot, start: boot.startAt as number, end: boot.bootAt }))
    .sort((a, b) => a.start - b.start);
  const outages: Outage[] = [];
  for (const { boot, start, end } of spans) {
    const last = outages.at(-1);
    const ref = { deviceId: boot.deviceId, bootAt: boot.bootAt };
    if (last && start <= last.end) {
      last.end = Math.max(last.end, end);
      last.boots.push(ref);
      last.excluded = last.excluded && boot.excluded;
    } else {
      outages.push({ start, end, boots: [ref], seconds: 0, long: false, excluded: boot.excluded });
    }
  }
  return outages.map((outage) => {
    const seconds = outage.end - outage.start;
    return { ...outage, seconds, long: seconds > SHORT_INTERRUPTION_MAX_SECONDS };
  });
}

export interface YearSummary {
  year: number;
  longCount: number;
  longSeconds: number;
  shortCount: number;
  excludedCount: number;
  /** The zone's individual standard, when the zone is known. */
  standard: { interruptions: number; hours: number } | null;
  overCount: boolean;
  overHours: boolean;
}

/** Outages that started in a Lisbon calendar year, against the zone's standard. */
export function yearSummary(
  outages: readonly Outage[],
  year: number,
  zone: QualityZone | null,
): YearSummary {
  const inYear = outages.filter((outage) => lisbonParts(outage.start).year === year);
  const counted = inYear.filter((outage) => !outage.excluded);
  const long = counted.filter((outage) => outage.long);
  const longSeconds = long.reduce((sum, outage) => sum + outage.seconds, 0);
  const standard = zone ? zoneStandard(zone) : null;
  return {
    year,
    longCount: long.length,
    longSeconds,
    shortCount: counted.length - long.length,
    excludedCount: inYear.length - counted.length,
    standard,
    overCount: standard !== null && long.length > standard.interruptions,
    overHours: standard !== null && longSeconds > standard.hours * 3600,
  };
}
