// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * What was on at a power peak (the power alerts, server/src/alerts.ts): the
 * steps of the seconds before and after it, paired as "Ao segundo" pairs them
 * (cycles.ts), give the appliances on at that second; the named ones
 * (appliances.ts) by name. What the steps do not explain (on before the
 * window, the always-on devices) is the rest of the house. Then which of them
 * to switch off to be below a limit. Estimates, said as "probably": two
 * appliances of the same power cannot be told apart, and a step can be missed.
 */
import type { EpochSeconds } from '../lib/time';
import { classify, matchToleranceW, type Appliance } from './appliances';
import { MAX_CYCLE_S, pairSteps, type Cycle } from './cycles';
import { detectEvents } from './events';
import { mergeCycles } from './pipeline';
import { MISSING, type SecondsSeries } from './series';

/** The seconds looked at before the peak: long enough for an oven or a water heater. */
export const PEAK_WINDOW_S = 2 * 3600;
/** Smaller appliances are left in the rest of the house: switching one off would not help. */
export const MIN_LOAD_W = 200;
/** At most this many appliances to switch off. */
export const MAX_SWITCH_OFF = 3;

export interface PeakLoad {
  /** The appliances it may be (two of the same power: both); none when it fits none. */
  labels: string[];
  /** At the peak, measured: W; non-active, var. */
  powerW: number;
  nonActiveVar: number;
  /** When it was switched on. */
  since: EpochSeconds;
}

export interface PeakBreakdown {
  /** The second of the peak. */
  ts: EpochSeconds;
  powerW: number;
  nonActiveVar: number;
  apparentVa: number;
  /** Largest first; only from MIN_LOAD_W. */
  loads: PeakLoad[];
  /** What the loads do not explain, W (never below 0). */
  restW: number;
}

const apparent = (powerW: number, nonActiveVar: number) =>
  Math.round(Math.sqrt(powerW ** 2 + nonActiveVar ** 2));

/** The second of [from, to) with the highest apparent power; null without any. */
export function peakSecond(
  series: SecondsSeries,
  from: EpochSeconds,
  to: EpochSeconds,
): EpochSeconds | null {
  let best: EpochSeconds | null = null;
  let bestVa = -1;
  for (let ts = Math.max(from, series.start); ts < to; ts++) {
    const slot = ts - series.start;
    if (slot >= series.power.length) break;
    const power = series.power[slot] as number;
    const nonActive = series.nonActive[slot] as number;
    if (power === MISSING || nonActive === MISSING) continue;
    const va = apparent(power, nonActive);
    if (va > bestVa) {
      best = ts;
      bestVa = va;
    }
  }
  return best;
}

/** The appliances a step of this power may be, by power alone (it is not over yet). */
function byPower(powerW230: number, appliances: readonly Appliance[]): string[] {
  const near = appliances
    .map((item) => ({
      label: item.label,
      gap: Math.min(
        ...[item.powerW, ...item.statesW].map((watts) =>
          Math.abs(watts - powerW230) <= matchToleranceW(watts)
            ? Math.abs(watts - powerW230)
            : Infinity,
        ),
      ),
    }))
    .filter((item) => item.gap !== Infinity)
    .sort((a, b) => a.gap - b.gap);
  return [...new Set(near.map((item) => item.label))].slice(0, 2);
}

/** A cycle's measured power at a second: of the state it was in. */
function powerAt(cycle: Cycle, ts: EpochSeconds): number {
  return cycle.states.findLast((state) => state.from <= ts)?.powerW ?? cycle.powerW;
}

/**
 * What was on at second `ts` of `series` (the seconds from PEAK_WINDOW_S
 * before it to as late as there are); null when that second is missing.
 */
export function breakdownAt(
  series: SecondsSeries,
  ts: EpochSeconds,
  appliances: readonly Appliance[],
): PeakBreakdown | null {
  const slot = ts - series.start;
  const powerW = series.power[slot];
  const nonActiveVar = series.nonActive[slot];
  if (powerW === undefined || nonActiveVar === undefined) return null;
  if (powerW === MISSING || nonActiveVar === MISSING) return null;
  const { cycles: paired, open } = pairSteps(detectEvents(series));
  // Names from the cycles as "Ao segundo" groups them (a programme, a run of pulses);
  // the power at the peak from the steps themselves (a washing machine heats, then turns).
  const merged = mergeCycles(paired, series);
  const named = classify(merged, appliances);
  const found: PeakLoad[] = [];
  for (const cycle of paired) {
    if (cycle.start > ts || cycle.end <= ts) continue;
    const whole = merged.find((item) => item.start <= cycle.start && cycle.end <= item.end);
    const name =
      (whole && named.get(whole.start)) ?? classify([cycle], appliances).get(cycle.start);
    found.push({
      labels: name ? [name.label] : byPower(cycle.powerW230, appliances),
      powerW: powerAt(cycle, ts),
      nonActiveVar: cycle.nonActiveVar,
      since: cycle.start,
    });
  }
  for (const load of open) {
    if (load.on.ts > ts || ts - load.on.ts > MAX_CYCLE_S) continue;
    found.push({
      labels: byPower(load.powerW230, appliances),
      powerW: load.powerW,
      nonActiveVar: load.nonActiveVar,
      since: load.on.ts,
    });
  }
  const loads = found
    .filter((load) => load.powerW >= MIN_LOAD_W)
    .sort((a, b) => b.powerW - a.powerW);
  const explained = loads.reduce((sum, load) => sum + load.powerW, 0);
  return {
    ts,
    powerW,
    nonActiveVar,
    apparentVa: apparent(powerW, nonActiveVar),
    loads,
    restW: Math.max(0, powerW - explained),
  };
}

/** The apparent power with these loads off, VA. */
export function apparentWithout(breakdown: PeakBreakdown, loads: readonly PeakLoad[]): number {
  const powerW = loads.reduce((sum, load) => sum - load.powerW, breakdown.powerW);
  const nonActive = loads.reduce((sum, load) => sum - load.nonActiveVar, breakdown.nonActiveVar);
  return apparent(Math.max(0, powerW), Math.max(0, nonActive));
}

/**
 * What to switch off to be at or below `limitVa`: the smallest load that is
 * enough alone, else the largest ones, up to MAX_SWITCH_OFF; null when the
 * peak was not above it or these loads are not enough.
 */
export function switchOff(
  breakdown: PeakBreakdown,
  limitVa: number,
): { loads: PeakLoad[]; apparentVa: number } | null {
  if (breakdown.apparentVa <= limitVa) return null;
  const smallest = [...breakdown.loads].reverse();
  const alone = smallest.find((load) => apparentWithout(breakdown, [load]) <= limitVa);
  if (alone) return { loads: [alone], apparentVa: apparentWithout(breakdown, [alone]) };
  const chosen: PeakLoad[] = [];
  for (const load of breakdown.loads.slice(0, MAX_SWITCH_OFF)) {
    chosen.push(load);
    const apparentVa = apparentWithout(breakdown, chosen);
    if (apparentVa <= limitVa) return { loads: chosen, apparentVa };
  }
  return null;
}
