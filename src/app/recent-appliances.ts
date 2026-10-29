// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The named appliances over the last whole days (src/nilm/recent.ts), from
 * each day's cycles kept on the server (nilm-days.ts) or, for the days not
 * there yet, its per-second values (seconds-cache.ts) analysed as "Ao segundo"
 * does, then kept. Shared by the card on "Consumo" and the AI's
 * get_appliances; the latest result is remembered for the same days,
 * appliances and tariffs, so neither works it out twice.
 */
import { addDays } from '../domain/consumption';
import { tariffOn, type Tariff } from '../domain/tariff';
import { lisbonDayLength, type LocalDate } from '../lib/time';
import type { Appliance } from '../nilm/appliances';
import { analyseDay, nameDay, type DayAnalysis } from '../nilm/day';
import {
  RECENT_DAYS,
  recentAppliances,
  type RecentAppliances,
  type RecentDay,
} from '../nilm/recent';
import { decodeSecondsRecords } from '../nilm/series';
import { keepAnalyses, storedAnalyses } from './nilm-days';
import { loadDaySeconds } from './seconds-cache';

export interface RecentInput {
  householdId: string;
  meter: string;
  today: LocalDate;
  /** The first day with the Shelly's values; null when unknown. */
  shellyFrom: LocalDate | null;
  tariffs: readonly Tariff[] | null;
  appliances: readonly Appliance[];
}

let latest: { key: string; result: Promise<RecentAppliances | null> } | null = null;

const keyOf = (input: RecentInput) =>
  JSON.stringify([
    input.householdId,
    input.meter,
    input.today,
    input.shellyFrom,
    input.tariffs,
    input.appliances,
  ]);

/** Lets the page draw between days (each takes a moment to analyse). */
const breathe = () => new Promise((resolve) => setTimeout(resolve, 0));

async function load(input: RecentInput): Promise<RecentAppliances | null> {
  const wanted: LocalDate[] = [];
  for (let back = 1; back <= RECENT_DAYS; back++) {
    const day = addDays(input.today, -back);
    if (input.shellyFrom && day < input.shellyFrom) break;
    wanted.push(day);
  }
  if (wanted.length === 0) return recentAppliances([]);
  // The days already worked out (on any device) are not read again from their seconds.
  const stored = await storedAnalyses(
    input.meter,
    wanted.at(-1) as LocalDate,
    wanted[0] as LocalDate,
  );
  const worked: DayAnalysis[] = [];
  const days: RecentDay[] = [];
  for (const day of wanted) {
    let analysis = stored.get(day);
    if (!analysis) {
      const outcome = await loadDaySeconds(input.householdId, input.meter, day);
      if (!outcome.ok) return null;
      analysis = analyseDay(decodeSecondsRecords(outcome.records), day);
      worked.push(analysis);
      await breathe();
    }
    const tariff = input.tariffs ? tariffOn(input.tariffs, day) : null;
    days.push({
      day,
      minutes: analysis.minutes,
      dayMinutes: lisbonDayLength(day) / 60,
      totals: nameDay(analysis, input.appliances, tariff).totals,
      periodsMap: tariff?.periodsMap ?? null,
    });
  }
  // Best effort: a failed save only means working the day out again next time.
  if (worked.length > 0) void keepAnalyses(input.meter, worked);
  return recentAppliances(days);
}

/** Null when a day could not be read. */
export function loadRecentAppliances(input: RecentInput): Promise<RecentAppliances | null> {
  const key = keyOf(input);
  if (latest?.key !== key) {
    const result = load(input);
    latest = { key, result };
    // A failure is not remembered: the next look tries again.
    void result.then((value) => {
      if (value === null && latest?.key === key) latest = null;
    });
  }
  return latest.result;
}
