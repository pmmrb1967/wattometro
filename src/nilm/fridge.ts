// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A fridge too small for the steps (Phase 8.3). The real one adds only 25–40 W
 * to the house, in a ramp, at the detector's floor (events.ts): its compressor
 * seems to change speed, and on a quiet night it is on for 70 minutes to 3
 * hours. What gives it away is the pause: on 26–31/10, night after night, the
 * house's level falls for 15–25 minutes and comes back about 27 W higher.
 *
 * So this looks at each minute's median level, not at the steps: a stretch of
 * PAUSE_MIN_MINUTES or more that stays flat, lower than what comes before it,
 * and that ends going up by MIN_RISE_W to MAX_RISE_W. The way down can be
 * larger (something else may switch off in the same minute); the way up is the
 * fridge alone, so its size is the fridge's power. Daytime has look-alikes,
 * and hides many real pauses: what stays is what agrees with the day's other
 * pauses in rise and length, and a house needs MIN_PAUSES of them.
 *
 * A fridge of 60 W or more has steps the detector sees: it gets its cycles and
 * the user's name (cycles.ts, appliances.ts), and is not looked for here.
 *
 * Limits: the share of time on comes from pauses at most MAX_GAP_S apart, so
 * it says nothing of a day with none close enough; energy is that share of the
 * day at the fridge's power, an estimate. The name is an inference: a pump on
 * a timer would look the same.
 */
import type { EpochSeconds } from '../lib/time';
import type { Wh } from '../lib/units';
import { MISSING, type SecondsSeries } from './series';

const MINUTE_S = 60;
export const PAUSE_MIN_MINUTES = 14;
export const PAUSE_MAX_MINUTES = 30;
/** The real rises: 21–33 W; below this, the wobble of a quiet house. */
export const MIN_RISE_W = 18;
export const MAX_RISE_W = 60;
/** Minutes of level looked at on each side of a pause. */
const SIDE_MINUTES = 5;
/** 10th to 75th percentile of a pause: the real ones spread 3–12 W. */
const FLAT_W = 14;
/** A pause's edges are this close to its level, and what is next to them this far. */
const EDGE_W = 11;
/** Share of a pause's minutes that must exist. */
const MIN_COVERED = 0.8;
export const MIN_PAUSES = 2;
/** How far from the day's middle a pause may be: rise, then length. */
const RISE_TOLERANCE = 0.3;
const LENGTH_TOLERANCE = 0.35;
/** On for 3 h at most on the real nights, plus a pause: further apart, some were hidden. */
const MAX_GAP_S = 4 * 3600;

export interface FridgePause {
  start: EpochSeconds;
  end: EpochSeconds;
  /** The house's level meanwhile, W: what it draws without the fridge at that time. */
  lowW: number;
}

export interface Fridge {
  /** What it adds to the house when on, W. */
  powerW: number;
  /** Share of the time on, %; null when no two pauses are close enough to tell. */
  onPct: number | null;
  /** What it used in the day (an estimate); null without `onPct`. */
  energyWh: Wh | null;
  pauses: FridgePause[];
}

interface Candidate {
  from: number;
  to: number;
  lowW: number;
  riseW: number;
}

const middle = (values: readonly number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] as number;

const present = (levels: readonly (number | null)[]) => levels.filter((level) => level !== null);

/** The median of each minute of the series; null with no values. */
function minuteLevels(series: SecondsSeries): (number | null)[] {
  const levels: (number | null)[] = [];
  for (let first = 0; first < series.power.length; first += MINUTE_S) {
    const values = [...series.power.subarray(first, first + MINUTE_S)].filter(
      (watts) => watts !== MISSING,
    );
    levels.push(values.length === 0 ? null : middle(values));
  }
  return levels;
}

/** Whether [from, to) of the minutes is a pause, and how high it is if so. */
function pauseAt(levels: readonly (number | null)[], from: number, to: number): Candidate | null {
  const inside = present(levels.slice(from, to));
  if (inside.length < (to - from) * MIN_COVERED) return null;
  const before = present(levels.slice(from - SIDE_MINUTES, from));
  const after = present(levels.slice(to, to + SIDE_MINUTES));
  if (before.length < SIDE_MINUTES / 2 || after.length < SIDE_MINUTES / 2) return null;

  const lowW = middle(inside);
  const riseW = middle(after) - lowW;
  if (riseW < MIN_RISE_W || riseW > MAX_RISE_W || middle(before) - lowW < MIN_RISE_W) return null;
  // Starts and ends as a step: not the edge of a slow drift.
  const isLow = (level: number | null | undefined) => level != null && level <= lowW + EDGE_W;
  const isHigh = (level: number | null | undefined) => level != null && level >= lowW + EDGE_W;
  if (!isLow(levels[from]) || !isLow(levels[to - 1])) return null;
  if (!isHigh(levels[from - 1]) && !isHigh(levels[from - 2])) return null;
  if (!isHigh(levels[to]) && !isHigh(levels[to + 1])) return null;
  // Flat, but a minute or two of something else is allowed.
  const sorted = [...inside].sort((a, b) => a - b);
  const p10 = sorted[Math.floor(sorted.length * 0.1)] as number;
  const p75 = sorted[Math.floor(sorted.length * 0.75)] as number;
  return p75 - p10 <= FLAT_W ? { from, to, lowW, riseW } : null;
}

function candidates(levels: readonly (number | null)[]): Candidate[] {
  const found: Candidate[] = [];
  for (let from = SIDE_MINUTES; from + PAUSE_MIN_MINUTES < levels.length; from++) {
    // Most minutes: no way down into them, which pauseAt would refuse the long way.
    const level = levels[from] ?? null;
    const before = present(levels.slice(from - SIDE_MINUTES, from));
    if (level === null || before.length === 0) continue;
    if (middle(before) - level < MIN_RISE_W - EDGE_W) continue;
    let best: Candidate | null = null;
    for (let to = from + PAUSE_MIN_MINUTES; to <= from + PAUSE_MAX_MINUTES; to++) {
      if (to + SIDE_MINUTES > levels.length) break;
      best = pauseAt(levels, from, to) ?? best;
    }
    if (best) {
      found.push(best);
      from = best.to - 1;
    }
  }
  return found;
}

/** The share of the time between pauses close enough to measure it, %. */
function onShare(pauses: readonly FridgePause[]): number | null {
  let total = 0;
  let on = 0;
  for (let index = 1; index < pauses.length; index++) {
    const previous = pauses[index - 1] as FridgePause;
    const gap = (pauses[index] as FridgePause).start - previous.start;
    if (gap > MAX_GAP_S) continue;
    total += gap;
    on += (pauses[index] as FridgePause).start - previous.end;
  }
  return total === 0 ? null : Math.round((on * 100) / total);
}

/** The day's fridge, or null when no regular pause shows one. */
export function findFridge(series: SecondsSeries): Fridge | null {
  const levels = minuteLevels(series);
  const all = candidates(levels);
  if (all.length < MIN_PAUSES) return null;
  const riseW = middle(all.map((pause) => pause.riseW));
  const minutes = middle(all.map((pause) => pause.to - pause.from));
  const agreeing = all.filter(
    (pause) =>
      Math.abs(pause.riseW - riseW) <= riseW * RISE_TOLERANCE &&
      Math.abs(pause.to - pause.from - minutes) <= minutes * LENGTH_TOLERANCE,
  );
  if (agreeing.length < MIN_PAUSES) return null;
  const pauses = agreeing.map(({ from, to, lowW }) => ({
    start: series.start + from * MINUTE_S,
    end: series.start + to * MINUTE_S,
    lowW,
  }));
  const powerW = middle(agreeing.map((pause) => pause.riseW));
  const onPct = onShare(pauses);
  const measuredS = present(levels).length * MINUTE_S;
  return {
    powerW,
    onPct,
    energyWh: onPct === null ? null : Math.round((powerW * onPct * measuredS) / 360_000),
    pauses,
  };
}

/**
 * Whether a level of the house is one without the fridge running: that of one
 * of the day's pauses. By level, not by the nearest in time: a pause seen with
 * something else on (on 26/10, at 862 W) says nothing of a quiet house.
 */
export function fridgeOffAt(fridge: Fridge, levelW: number): boolean {
  return fridge.pauses.some((pause) => Math.abs(levelW - pause.lowW) < fridge.powerW / 2);
}
