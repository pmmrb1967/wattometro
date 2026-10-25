// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Periodic patterns (Phase 8.1): an induction hob below its full power, or an
 * oven holding its temperature, switches the same power on and off every few
 * seconds or minutes. pairCycles sees each pulse as a cycle; here a run of at
 * least MIN_PULSES short cycles of the same power (matchToleranceW), each
 * starting at most MAX_GAP_S after the previous one ended, becomes one cycle
 * with `pulses`: one use of the appliance. Other cycles meanwhile (the fridge)
 * stay as they are.
 *
 * Pulses shorter than MIN_STEADY_S (3 s) leave no steady state to detect and
 * are not seen at all; real hobs will tell whether that matters.
 */
import { matchToleranceW, type Cycle } from './cycles';

/** The longest pulse looked for (an oven's element holding the temperature). */
export const MAX_PULSE_S = 300;
/** The longest pause between two pulses of the same use. */
export const MAX_GAP_S = 120;
export const MIN_PULSES = 3;

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 === 1
    ? (sorted[middle] as number)
    : Math.round(((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2);
}

function merge(run: readonly Cycle[]): Cycle {
  const first = run[0] as Cycle;
  const last = run[run.length - 1] as Cycle;
  const powerW = median(run.map((cycle) => cycle.powerW));
  const energyWs = run.reduce((sum, cycle) => sum + cycle.powerW * cycle.durationS, 0);
  return {
    on: first.on,
    off: last.off,
    start: first.start,
    end: last.end,
    durationS: last.end - first.start,
    powerW,
    powerW230: median(run.map((cycle) => cycle.powerW230)),
    nonActiveVar: median(run.map((cycle) => cycle.nonActiveVar)),
    energyWh: Math.round(energyWs / 3600),
    states: [{ from: first.start, powerW }],
    pulses: { count: run.length, onS: run.reduce((sum, cycle) => sum + cycle.durationS, 0) },
  };
}

/** The cycles with each run of pulses made one; in start order. */
export function mergePulses(cycles: readonly Cycle[]): Cycle[] {
  const runs: Cycle[][] = [];
  const others: Cycle[] = [];
  for (const cycle of [...cycles].sort((a, b) => a.start - b.start)) {
    if (cycle.durationS > MAX_PULSE_S || cycle.states.length > 1) {
      others.push(cycle);
      continue;
    }
    // The latest run this pulse continues: the same power, not too long after.
    const run = runs.findLast((list) => {
      const previous = list[list.length - 1] as Cycle;
      return (
        cycle.start - previous.end <= MAX_GAP_S &&
        cycle.start >= previous.end &&
        Math.abs(cycle.powerW230 - previous.powerW230) <= matchToleranceW(previous.powerW230)
      );
    });
    if (run) run.push(cycle);
    else runs.push([cycle]);
  }
  for (const run of runs) {
    if (run.length >= MIN_PULSES) others.push(merge(run));
    else others.push(...run);
  }
  return others.sort((a, b) => a.start - b.start);
}
