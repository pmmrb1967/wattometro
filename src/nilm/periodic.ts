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
 * Two plates of a hob of the same power pulse at the same time, so their
 * pulses overlap: a pulse that starts before the run's latest end still
 * continues it (one use of the hob, the energy of both plates). A plate at
 * full power first heats continuously for a few minutes, then pulses: a
 * steady cycle of the run's power that overlaps it, or ends at most MAX_GAP_S
 * before it starts, is part of the same use (measured on a real hob, 26/10).
 *
 * With two plates, steps often come within 3 s of each other and are missed;
 * an on is then paired with an off much later, and the plate counts as on
 * through its pauses (+19 % on the real hob). Given the series, a use's energy
 * is capped at what the house drew above its level before the use, second by
 * second.
 *
 * Pulses shorter than MIN_STEADY_S (3 s) leave no steady state to detect and
 * are not seen at all; real hobs will tell whether that matters.
 */
import { matchToleranceW, type Cycle } from './cycles';
import { MISSING, type SecondsSeries } from './series';

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

/** The latest end of a run (pulses of two plates overlap). */
const runEnd = (run: readonly Cycle[]) => Math.max(...run.map((cycle) => cycle.end));

const samePower = (a: Cycle, b: Cycle) =>
  Math.abs(a.powerW230 - b.powerW230) <= matchToleranceW(b.powerW230);

/** Energy above `baseW` over [from, to), Wh (missing seconds count as nothing). */
function drawnAboveWh(series: SecondsSeries, from: number, to: number, baseW: number): number {
  let joules = 0;
  const first = Math.max(0, from - series.start);
  const last = Math.min(series.power.length, to - series.start);
  for (let index = first; index < last; index++) {
    const watts = series.power[index] as number;
    if (watts !== MISSING && watts > baseW) joules += watts - baseW;
  }
  return joules / 3600;
}

function merge(run: readonly Cycle[], series?: SecondsSeries): Cycle {
  const sorted = [...run].sort((a, b) => a.start - b.start);
  const first = sorted[0] as Cycle;
  const end = runEnd(sorted);
  const last = sorted.findLast((cycle) => cycle.end === end) as Cycle;
  const pulses = sorted.filter((cycle) => cycle.durationS <= MAX_PULSE_S);
  const powerW = median(pulses.map((cycle) => cycle.powerW));
  const pairedWh = sorted.reduce((sum, cycle) => sum + cycle.powerW * cycle.durationS, 0) / 3600;
  const drawnWh = series ? drawnAboveWh(series, first.start, end, first.on.beforeW) : Infinity;
  return {
    on: first.on,
    off: last.off,
    start: first.start,
    end,
    durationS: end - first.start,
    powerW,
    powerW230: median(pulses.map((cycle) => cycle.powerW230)),
    nonActiveVar: median(pulses.map((cycle) => cycle.nonActiveVar)),
    energyWh: Math.round(Math.min(pairedWh, drawnWh)),
    states: [{ from: first.start, powerW }],
    pulses: {
      count: sorted.length,
      onS: sorted.reduce((sum, cycle) => sum + cycle.durationS, 0),
    },
  };
}

/** The cycles with each run of pulses made one; in start order. */
export function mergePulses(cycles: readonly Cycle[], series?: SecondsSeries): Cycle[] {
  const runs: Cycle[][] = [];
  const others: Cycle[] = [];
  for (const cycle of [...cycles].sort((a, b) => a.start - b.start)) {
    if (cycle.durationS > MAX_PULSE_S || cycle.states.length > 1) {
      others.push(cycle);
      continue;
    }
    // The latest run this pulse continues: the same power, not too long after
    // (or overlapping, another plate of the same hob).
    const run = runs.findLast(
      (list) =>
        cycle.start - runEnd(list) <= MAX_GAP_S && samePower(cycle, list[list.length - 1] as Cycle),
    );
    if (run) run.push(cycle);
    else runs.push([cycle]);
  }
  const merged: Cycle[][] = [];
  for (const run of runs) {
    if (run.length >= MIN_PULSES) merged.push(run);
    else others.push(...run);
  }
  // A plate heating continuously before it pulses: the steady cycle joins the use.
  const rest: Cycle[] = [];
  for (const cycle of others) {
    const run =
      cycle.states.length === 1 && cycle.pulses === undefined
        ? merged.find(
            (list) =>
              samePower(cycle, list[0] as Cycle) &&
              cycle.start <= runEnd(list) &&
              (list[0] as Cycle).start - cycle.end <= MAX_GAP_S,
          )
        : undefined;
    if (run) run.push(cycle);
    else rest.push(cycle);
  }
  // A steady cycle can bridge two runs (a plate heating between another's pulses and its own).
  const uses: Cycle[][] = [];
  for (const run of merged.sort((a, b) => (a[0] as Cycle).start - (b[0] as Cycle).start)) {
    const previous = uses[uses.length - 1];
    const first = run.reduce((earliest, cycle) => Math.min(earliest, cycle.start), Infinity);
    if (
      previous &&
      first - runEnd(previous) <= MAX_GAP_S &&
      samePower(run[0] as Cycle, previous[0] as Cycle)
    ) {
      previous.push(...run);
    } else {
      uses.push(run);
    }
  }
  return [...rest, ...uses.map((run) => merge(run, series))].sort((a, b) => a.start - b.start);
}
