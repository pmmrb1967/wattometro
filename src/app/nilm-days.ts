// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Each day's cycles kept on the server (Phase 8.1, src/nilm/stored.ts): read
 * before working a day out from its per-second values, saved once a day is
 * worked out and over (its seconds no longer change), and redone on demand
 * ("Reprocessar") when the detection improves. Days of another NILM_VERSION
 * are worked out again while their per-second values exist (90 days).
 */
import { nextDate, startOfLisbonDay, type EpochSeconds, type LocalDate } from '../lib/time';
import { analyseDay, type DayAnalysis } from '../nilm/day';
import { decodeSecondsRecords } from '../nilm/series';
import { analysisOf, decodeDay, encodeDay, NILM_VERSION } from '../nilm/stored';
import { fetchNilmDays, saveNilmDays, type NilmDayRow } from './api';
import { loadDaySeconds, SETTLED_SECONDS } from './seconds-cache';

/** Days the server keeps the per-second values (readings_1s retention). */
export const SECONDS_DAYS = 90;
/** Days sent in one PUT (the server takes 31). */
const SAVE_CHUNK = 7;

const nowSeconds = () => Math.floor(Date.now() / 1000);

/** The day is over and the Shelly cannot still be sending it. */
export const daySettled = (day: LocalDate, now: EpochSeconds = nowSeconds()) =>
  now >= startOfLisbonDay(nextDate(day)) + SETTLED_SECONDS;

/** The stored days of the current version in [from, to]; an empty map when they cannot be read. */
export async function storedAnalyses(
  meter: string,
  from: LocalDate,
  to: LocalDate,
): Promise<Map<LocalDate, DayAnalysis>> {
  const result = await fetchNilmDays(meter, from, to);
  const found = new Map<LocalDate, DayAnalysis>();
  if (!result.ok) return found;
  for (const row of result.days) {
    if (row.version !== NILM_VERSION) continue;
    const stored = await decodeDay(row.data);
    if (stored && stored.day === row.day) found.set(stored.day, analysisOf(stored));
  }
  return found;
}

/** Keeps the settled ones of these days on the server; false when a save failed. */
export async function keepAnalyses(meter: string, analyses: readonly DayAnalysis[]) {
  const rows: NilmDayRow[] = [];
  for (const analysis of analyses) {
    if (!daySettled(analysis.day) || analysis.minutes === 0) continue;
    rows.push({
      day: analysis.day,
      version: NILM_VERSION,
      minutes: analysis.minutes,
      data: await encodeDay(analysis),
    });
  }
  for (let i = 0; i < rows.length; i += SAVE_CHUNK) {
    const saved = await saveNilmDays(meter, rows.slice(i, i + SAVE_CHUNK));
    if (!saved.ok) return false;
  }
  return true;
}

/** Lets the page draw between days (each takes a moment to analyse). */
const breathe = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Works the days out again from their per-second values and replaces what was
 * stored (idempotent: the same days give the same result). Days without
 * per-second values any more are left as they were. `progress` gets the days
 * done; the number of days saved, or null when one could not be read or saved.
 */
export async function reprocessDays(
  householdId: string,
  meter: string,
  days: readonly LocalDate[],
  progress: (done: number) => void,
): Promise<number | null> {
  let saved = 0;
  let pending: DayAnalysis[] = [];
  for (const [index, day] of days.entries()) {
    const outcome = await loadDaySeconds(householdId, meter, day);
    if (!outcome.ok) return null;
    const analysis = analyseDay(decodeSecondsRecords(outcome.records), day);
    if (analysis.minutes > 0 && daySettled(day)) pending.push(analysis);
    if (pending.length === SAVE_CHUNK || index === days.length - 1) {
      if (!(await keepAnalyses(meter, pending))) return null;
      saved += pending.length;
      pending = [];
    }
    progress(index + 1);
    await breathe();
  }
  return saved;
}
