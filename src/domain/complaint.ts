// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The facts a power-quality complaint rests on (RQS art. 66.º, n.º 1: "factos
 * indiciadores" of parameters outside the limits): weeks outside NP EN 50160,
 * the extreme minutes, and the year's outages when over the zone's standard.
 * Facts only; the letter that cites them is text (src/i18n).
 */
import type { EpochSeconds, LocalDate } from '../lib/time';
import type { Decivolts } from '../lib/units';
import type { VoltageEpisode, WeekCompliance, YearSummary } from './voltage';

export interface FailingWeek {
  week: LocalDate;
  evaluated: number;
  outsideBand: number;
  /** Some 10-minute value below − 15 % or above + 10 %. */
  outsideLimits: number;
}

export interface ComplaintGrounds {
  /** Weeks failing the standard on any meter, the worst meter's figures, oldest first. */
  weeks: FailingWeek[];
  low: { count: number; extremeDv: Decivolts; at: EpochSeconds } | null;
  high: { count: number; extremeDv: Decivolts; at: EpochSeconds } | null;
  /** The year's outages, only when over the standard. */
  outages: YearSummary | null;
}

const worse = (a: FailingWeek, b: FailingWeek) =>
  b.outsideLimits - a.outsideLimits || b.outsideBand * a.evaluated - a.outsideBand * b.evaluated;

function extreme(
  episodes: readonly VoltageEpisode[],
  kind: 'low' | 'high',
): ComplaintGrounds['low'] {
  const list = episodes.filter((episode) => episode.kind === kind);
  if (list.length === 0) return null;
  const pick = list.reduce((best, episode) =>
    (kind === 'low' ? episode.extremeDv < best.extremeDv : episode.extremeDv > best.extremeDv)
      ? episode
      : best,
  );
  return { count: list.length, extremeDv: pick.extremeDv, at: pick.start };
}

/** Null when there is nothing outside the limits to complain about. */
export function complaintGrounds(
  weeksByMeter: readonly (readonly WeekCompliance[])[],
  episodes: readonly VoltageEpisode[],
  outages: YearSummary,
): ComplaintGrounds | null {
  const byWeek = new Map<LocalDate, FailingWeek>();
  for (const week of weeksByMeter.flat()) {
    if (week.meetsBand && week.meetsLimits) continue;
    const entry: FailingWeek = {
      week: week.week,
      evaluated: week.evaluated,
      outsideBand: week.outsideBand,
      outsideLimits: week.outsideLimits,
    };
    const known = byWeek.get(week.week);
    if (!known || worse(known, entry) > 0) byWeek.set(week.week, entry);
  }
  const weeks = [...byWeek.values()].sort((a, b) => a.week.localeCompare(b.week));
  const over = outages.overCount || outages.overHours;
  if (weeks.length === 0 && !over) return null;
  return {
    weeks,
    low: extreme(episodes, 'low'),
    high: extreme(episodes, 'high'),
    outages: over ? outages : null,
  };
}
