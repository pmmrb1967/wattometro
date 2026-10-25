// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The cycles of a day grouped by power, for reading them: cycles within
 * groupToleranceW of a group's median join it (the fridge's 28 cycles become
 * one line). Tighter than pairing an on with its off: a water heater (1800 W),
 * a dishwasher (1900 W) and a kettle (2000 W) stay apart. Not yet
 * appliances: labelling is Phase 8.3.
 */
import type { Cycle } from './cycles';

/** 20 W, or 3 % (the same resistance at 230 V varies less than that). */
export function groupToleranceW(powerW: number): number {
  return Math.max(20, Math.abs(powerW) * 0.03);
}

export interface CycleGroup {
  /** Median of the group's powers (230 V), W. */
  powerW: number;
  count: number;
  /** Median duration, s. */
  durationS: number;
  energyWh: number;
  /** The measured power of each state of the group's first cycle (one for most), W. */
  statesW: number[];
  cycles: Cycle[];
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 === 1
    ? (sorted[middle] as number)
    : Math.round(((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2);
}

/** The same number of states, each of a similar power (the kettle is not a washing machine). */
function sameStates(a: Cycle, b: Cycle): boolean {
  return (
    a.states.length === b.states.length &&
    a.states.every(
      (state, index) =>
        index === 0 ||
        Math.abs(state.powerW - (b.states[index] as { powerW: number }).powerW) <=
          groupToleranceW(state.powerW),
    )
  );
}

/** Groups, the most energy first. */
export function groupCycles(cycles: readonly Cycle[]): CycleGroup[] {
  const groups: Cycle[][] = [];
  for (const cycle of [...cycles].sort((a, b) => a.powerW230 - b.powerW230)) {
    // In power order, the group this cycle can join is the latest of its kind.
    const last = groups.findLast((group) => sameStates(group[0] as Cycle, cycle));
    const level = last ? median(last.map((item) => item.powerW230)) : null;
    if (last && level !== null && cycle.powerW230 - level <= groupToleranceW(level)) {
      last.push(cycle);
    } else {
      groups.push([cycle]);
    }
  }
  return groups
    .map((list) => ({
      powerW: median(list.map((item) => item.powerW230)),
      count: list.length,
      durationS: median(list.map((item) => item.durationS)),
      energyWh: list.reduce((sum, item) => sum + item.energyWh, 0),
      cycles: list.sort((a, b) => a.start - b.start),
      statesW: (list[0] as Cycle).states.map((state) => state.powerW),
    }))
    .sort((a, b) => b.energyWh - a.energyWh);
}
