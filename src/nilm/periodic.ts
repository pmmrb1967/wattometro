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
 *
 * An appliance on a timer (a slow cooker on the real 02/11: 180 W, 160 s on and
 * 20 s off for 3 h 20 min) keeps a beat, and other appliances hide some of its
 * steps: pulses go missing, and an on pairs with the off of a later pulse. Such
 * a run goes on through up to MAX_MISSED_PERIODS periods, taking in whatever
 * starts on its beat at about its power (extendBeat). Its energy comes from the
 * beat, as the pairs left would miss the lost pulses and count the long ones
 * as if the pauses had not been there.
 */
import { matchToleranceW, type Cycle } from './cycles';
import { MISSING, type SecondsSeries } from './series';

/** The longest pulse looked for (an oven's element holding the temperature). */
export const MAX_PULSE_S = 300;
/** The longest pause between two pulses of the same use. */
export const MAX_GAP_S = 120;
export const MIN_PULSES = 3;
/** A beat needs this many pulses, and a period this long: a hob's seconds are not a timer. */
const MIN_BEAT_PULSES = 4;
const MIN_PERIOD_S = 90;
/** How far from the period or the pulse's length: steps are read with some seconds of error. */
const BEAT_TOLERANCE = 0.15;
const MAX_MISSED_PERIODS = 4;
/** Wider than matchToleranceW: what else is on moves a step by tens of watts. */
const BEAT_POWER_TOLERANCE = 0.35;

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

const isPulse = (cycle: Cycle) => cycle.durationS <= MAX_PULSE_S;

interface Beat {
  periodS: number;
  /** How long each pulse lasts, s. */
  pulseS: number;
}

const mostlyNear = (values: readonly number[], target: number) =>
  values.filter((value) => Math.abs(value - target) <= target * BEAT_TOLERANCE).length * 3 >=
  values.length * 2;

/**
 * The timer of a run, if it has one: most pulses last the same and start one
 * period after the previous. A thermostat keeps no such length: an airfryer
 * pulses every 60 s, for 45 s when it heats and 15 s when it holds (real 31/10).
 */
function beatOf(run: readonly Cycle[]): Beat | null {
  const pulses = run.filter(isPulse).sort((a, b) => a.start - b.start);
  if (pulses.length < MIN_BEAT_PULSES) return null;
  const gaps = pulses.slice(1).map((cycle, index) => cycle.start - pulses[index]!.start);
  const periodS = median(gaps);
  const lengths = pulses.map((cycle) => cycle.durationS);
  const pulseS = median(lengths);
  if (periodS < MIN_PERIOD_S || !mostlyNear(gaps, periodS) || !mostlyNear(lengths, pulseS)) {
    return null;
  }
  return { periodS, pulseS };
}

/** Whether `seconds` is a whole number of periods, at least one. */
function onBeat(seconds: number, periodS: number): boolean {
  const beyond = seconds % periodS;
  return (
    seconds >= periodS * (1 - BEAT_TOLERANCE) &&
    Math.min(beyond, periodS - beyond) <= periodS * BEAT_TOLERANCE
  );
}

function merge(run: readonly Cycle[], series?: SecondsSeries): Cycle {
  const sorted = [...run].sort((a, b) => a.start - b.start);
  const first = sorted[0] as Cycle;
  const end = runEnd(sorted);
  const last = sorted.findLast((cycle) => cycle.end === end) as Cycle;
  const pulses = sorted.filter(isPulse);
  const powerW = median(pulses.map((cycle) => cycle.powerW));
  const beat = beatOf(sorted);
  const starts = pulses.map((cycle) => cycle.start);
  const periodS = beat
    ? beat.periodS
    : starts.length < 2
      ? 0
      : median(starts.slice(1).map((start, index) => start - (starts[index] as number)));
  const periods = beat ? Math.round((end - first.start) / beat.periodS) : sorted.length;
  const onS = beat
    ? periods * beat.pulseS
    : sorted.reduce((sum, cycle) => sum + cycle.durationS, 0);
  const pairedWh = beat
    ? (powerW * onS) / 3600
    : sorted.reduce((sum, cycle) => sum + cycle.powerW * cycle.durationS, 0) / 3600;
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
    pulses: { count: periods, onS, periodS },
  };
}

/**
 * Each use with a beat goes on through what it finds on that beat, later uses
 * included whole. The others come back untouched, with the cycles nothing took.
 */
function extendBeat(uses: readonly Cycle[][], rest: readonly Cycle[]) {
  const useOf = new Map(uses.flatMap((use) => use.map((cycle) => [cycle, use] as const)));
  const taken = new Set<Cycle>();
  const gone = new Set<Cycle[]>();
  const kept: Cycle[][] = [];
  const later = [...rest, ...useOf.keys()].sort((a, b) => a.start - b.start);
  for (const use of uses) {
    if (gone.has(use)) continue;
    kept.push(use);
    const beat = beatOf(use);
    if (!beat) continue;
    const powerW230 = median(use.filter(isPulse).map((cycle) => cycle.powerW230));
    let latest = Math.max(...use.map((cycle) => cycle.start));
    for (const cycle of later) {
      if (cycle.start <= latest || taken.has(cycle) || gone.has(useOf.get(cycle) as Cycle[])) {
        continue;
      }
      if (cycle.start - latest > (MAX_MISSED_PERIODS + 1) * beat.periodS) break;
      if (Math.abs(cycle.powerW230 - powerW230) > powerW230 * BEAT_POWER_TOLERANCE) continue;
      if (!onBeat(cycle.start - latest, beat.periodS)) continue;
      const other = useOf.get(cycle);
      if (other === use) continue;
      if (other) gone.add(other);
      const joined = other ?? [cycle];
      for (const item of joined) taken.add(item);
      use.push(...joined);
      latest = Math.max(latest, ...joined.map((item) => item.start));
    }
  }
  return { uses: kept, rest: rest.filter((cycle) => !taken.has(cycle)) };
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
  const extended = extendBeat(uses, rest);
  return [...extended.rest, ...extended.uses.map((run) => merge(run, series))].sort(
    (a, b) => a.start - b.start,
  );
}
