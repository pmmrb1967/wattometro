// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Power steps in the per-second series of a meter (Phase 8.1): the series is
 * split into steady states (each second within a tolerance of the state's
 * mean), and a change between two steady states of at least MIN_STEP_W is an
 * event. The seconds between them are its transient: a start-up peak above
 * the new level (motors, compressors) or a ramp (inverters).
 *
 * The states are found on the measured power. Only each step is scaled to
 * 230 V (deltaW230, as if the appliance were a resistance), so the same
 * appliance compares across days of different voltage; scaling the whole
 * house would turn a voltage dip into steps.
 *
 * At about one sample a second there are no millisecond transients nor
 * harmonics (planning/plan.md, Phase 8): only what a second shows.
 */
import type { EpochSeconds } from '../lib/time';
import { MISSING, type SecondsSeries } from './series';

/** Changes with the parameters below, so stored events can be detected again. */
export const DETECTOR_VERSION = 2;
/** Smallest step that is an event, W. */
export const MIN_STEP_W = 30;
/** Seconds within tolerance that make a steady state. */
export const MIN_STEADY_S = 3;
/** Longest transient kept (a slow ramp); longer is not one appliance switching. */
export const MAX_TRANSIENT_S = 120;
/** A transient this long, moving one way, is a ramp. */
const RAMP_MIN_S = 4;
/** Seconds of each state used for the levels before and after an event. */
const LEVEL_SECONDS = 10;
/** Seconds of the new state over which its stability is measured. */
const STABILITY_SECONDS = 60;
const NOMINAL_DV = 2300;

/** How far a second may be from its state's mean: 15 W, or 2 % at high power. */
export function tolerance(levelW: number): number {
  return Math.max(15, Math.abs(levelW) * 0.02);
}

export interface PowerEvent {
  /** First second of the new state. */
  ts: EpochSeconds;
  /** Change of active power, W (negative when something switched off). */
  deltaW: number;
  /** The same change scaled to 230 V with the voltage after it. */
  deltaW230: number;
  /** Change of non-active power, var. */
  deltaVar: number;
  beforeW: number;
  afterW: number;
  /** How far the transient went beyond the new level, W (0 when it did not). */
  overshootW: number;
  /** Seconds between the two steady states. */
  transientS: number;
  /** The transient moved steadily one way over several seconds (an inverter). */
  ramp: boolean;
  /** Standard deviation of the first minute of the new state, W. */
  afterStdW: number;
}

interface State {
  /** [start, end) slots. */
  start: number;
  end: number;
}

/** Steady states: runs of at least MIN_STEADY_S seconds, each within tolerance of the run's mean. */
export function steadyStates(power: Int32Array): State[] {
  const states: State[] = [];
  let start = 0;
  let sum = 0;
  let count = 0;
  const close = (end: number) => {
    if (count >= MIN_STEADY_S) states.push({ start, end });
  };
  for (let slot = 0; slot < power.length; slot++) {
    const value = power[slot] as number;
    if (value === MISSING) {
      close(slot);
      count = 0;
      sum = 0;
      continue;
    }
    if (count > 0 && Math.abs(value - sum / count) <= tolerance(sum / count)) {
      sum += value;
      count++;
    } else {
      close(slot);
      start = slot;
      sum = value;
      count = 1;
    }
  }
  close(power.length);
  return states;
}

function mean(values: Int32Array, from: number, to: number): number {
  let sum = 0;
  for (let slot = from; slot < to; slot++) sum += values[slot] as number;
  return sum / (to - from);
}

/** Mean of the present values in [from, to), or null when none is present. */
function meanPresent(values: Int32Array, from: number, to: number): number | null {
  let sum = 0;
  let count = 0;
  for (let slot = from; slot < to; slot++) {
    const value = values[slot] as number;
    if (value === MISSING) continue;
    sum += value;
    count++;
  }
  return count > 0 ? sum / count : null;
}

function standardDeviation(values: Int32Array, from: number, to: number): number {
  const average = mean(values, from, to);
  let sum = 0;
  for (let slot = from; slot < to; slot++) sum += ((values[slot] as number) - average) ** 2;
  return Math.sqrt(sum / (to - from));
}

export function detectEvents(series: SecondsSeries): PowerEvent[] {
  const { power, nonActive, voltage } = series;
  const states = steadyStates(power);
  const events: PowerEvent[] = [];
  for (let index = 1; index < states.length; index++) {
    const before = states[index - 1] as State;
    const after = states[index] as State;
    const transientS = after.start - before.end;
    if (transientS > MAX_TRANSIENT_S) continue;
    let gap = false;
    for (let slot = before.end; slot < after.start; slot++) {
      if (power[slot] === MISSING) gap = true;
    }
    if (gap) continue;

    const beforeW = mean(power, Math.max(before.start, before.end - LEVEL_SECONDS), before.end);
    const afterEnd = Math.min(after.end, after.start + LEVEL_SECONDS);
    const afterW = mean(power, after.start, afterEnd);
    const deltaW = afterW - beforeW;
    if (Math.abs(deltaW) < MIN_STEP_W) continue;

    const sign = Math.sign(deltaW);
    let extreme = afterW;
    let towards = 0;
    for (let slot = before.end; slot < after.start; slot++) {
      const value = power[slot] as number;
      if (sign * (value - extreme) > 0) extreme = value;
      const previous = slot === before.end ? beforeW : (power[slot - 1] as number);
      if (sign * (value - previous) > 0) towards++;
    }
    const overshootW = Math.max(0, sign * (extreme - afterW));
    const ramp =
      transientS >= RAMP_MIN_S && overshootW <= tolerance(afterW) && towards >= 0.8 * transientS;

    const qBefore = meanPresent(
      nonActive,
      Math.max(before.start, before.end - LEVEL_SECONDS),
      before.end,
    );
    const qAfter = meanPresent(nonActive, after.start, afterEnd);
    const volts = meanPresent(voltage, after.start, afterEnd);
    const scale = volts ? (NOMINAL_DV / volts) ** 2 : 1;
    events.push({
      ts: series.start + after.start,
      deltaW: Math.round(deltaW),
      deltaW230: Math.round(deltaW * scale),
      deltaVar: qBefore !== null && qAfter !== null ? Math.round(qAfter - qBefore) : 0,
      beforeW: Math.round(beforeW),
      afterW: Math.round(afterW),
      overshootW: Math.round(overshootW),
      transientS,
      ramp,
      afterStdW: Math.round(
        standardDeviation(power, after.start, Math.min(after.end, after.start + STABILITY_SECONDS)),
      ),
    });
  }
  return events;
}
