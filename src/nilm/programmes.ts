// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Whole programmes (Phase 8.3): a dishwasher or a washing machine heats its
 * water with a resistance (~2 kW) and does the rest with a pump or a motor.
 * Taken heating by heating, the two machines look alike (on 26/10: 1.96 kW
 * for 11 min, 2.00 kW for 12 min); what tells them apart is the programme.
 * The dishwasher heated four times in an hour, with its pump between; the
 * washing machine heated once, then turned its drum for an hour and spun.
 *
 * A heating is a steady cycle of at least HEAT_MIN_W (at 230 V) for at least
 * HEAT_MIN_S. Heatings of the same power (matchToleranceW) at most
 * MAX_HEAT_GAP_S apart are one programme. After the last heating, the
 * programme goes on while the machine still works: a minute whose seconds
 * spread over ACTIVE_SPREAD_W or more (a drum turning), or that stays
 * ACTIVE_LEVEL_W above the level before the programme (a steady spin), with
 * quiet stretches of at most MAX_QUIET_S, for at most MAX_TAIL_S, and never
 * past the start of another heating. Another appliance working right after
 * (the microwave) still lengthens it. A single heating is a programme only when long (SINGLE_HEAT_S)
 * and followed by MIN_TAIL_S of that: a kettle's 3 minutes, or a water
 * heater going quiet after heating, stay plain cycles.
 *
 * The programme's cycle starts with its first heating, carries `heats`, and
 * takes in the smaller cycles that fall wholly inside it (the pump, the
 * drum). Its energy is what the house drew above its level around the
 * programme (the lower of before and after), second by second. Something
 * else switched on meanwhile (the fridge) counts in it, and its cycles are
 * taken in: a limit of telling appliances apart by the whole house's power.
 */
import { matchToleranceW, type Cycle } from './cycles';
import { MISSING, type SecondsSeries } from './series';

export const HEAT_MIN_W = 1500;
export const HEAT_MIN_S = 120;
/** The longest pause between two heatings (the dishwasher of 26/10: 8 min). */
export const MAX_HEAT_GAP_S = 900;
/** A single heating needs this long and a tail this long to be a programme. */
export const SINGLE_HEAT_S = 300;
export const MIN_TAIL_S = 300;
/** Spread of a minute's seconds (10th to 90th percentile) that shows a motor working. */
export const ACTIVE_SPREAD_W = 150;
/** A minute this far above the level before the programme: a spin (+600 W on 26/10). */
export const ACTIVE_LEVEL_W = 300;
/** The longest quiet stretch within a tail (a washing machine soaking). */
export const MAX_QUIET_S = 600;
export const MAX_TAIL_S = 2 * 3600;

const WINDOW_S = 60;

const isHeat = (cycle: Cycle) =>
  cycle.states.length === 1 &&
  cycle.pulses === undefined &&
  cycle.heats === undefined &&
  cycle.powerW230 >= HEAT_MIN_W &&
  cycle.durationS >= HEAT_MIN_S;

const samePower = (a: Cycle, b: Cycle) =>
  Math.abs(a.powerW230 - b.powerW230) <= matchToleranceW(b.powerW230);

const runEnd = (run: readonly Cycle[]) => Math.max(...run.map((cycle) => cycle.end));

/** The seconds of [from, to) that are not missing, W. */
function powers(series: SecondsSeries, from: number, to: number): number[] {
  const values: number[] = [];
  const first = Math.max(0, from - series.start);
  const last = Math.min(series.power.length, to - series.start);
  for (let index = first; index < last; index++) {
    const watts = series.power[index] as number;
    if (watts !== MISSING) values.push(watts);
  }
  return values;
}

function percentile(sorted: readonly number[], share: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] as number;
}

/** The 10th to 90th percentile of a stretch (a stray reading of 0 W does not count). */
function spread(values: readonly number[]): number {
  if (values.length < WINDOW_S / 2) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return percentile(sorted, 0.9) - percentile(sorted, 0.1);
}

const middle = (values: readonly number[]) =>
  percentile(
    [...values].sort((a, b) => a - b),
    0.5,
  );

/** Where a programme's tail ends: the end of its last active minute, or `from`. */
function tailEnd(series: SecondsSeries, from: number, baseW: number, until: number): number {
  const seriesEnd = Math.min(series.start + series.power.length, until);
  let end = from;
  for (let at = from; at < seriesEnd && at < from + MAX_TAIL_S; at += WINDOW_S) {
    if (at - end > MAX_QUIET_S) break;
    const values = powers(series, at, at + WINDOW_S);
    const active =
      spread(values) >= ACTIVE_SPREAD_W ||
      (values.length > 0 && middle(values) - baseW >= ACTIVE_LEVEL_W);
    if (active) end = Math.min(at + WINDOW_S, seriesEnd);
  }
  return end;
}

/** The house's level in the minute after `at`: the median, or null with no values. */
function levelAfter(series: SecondsSeries, at: number): number | null {
  const values = powers(series, at, at + WINDOW_S);
  return values.length === 0 ? null : middle(values);
}

function programme(run: readonly Cycle[], end: number, series: SecondsSeries): Cycle {
  const heats = [...run].sort((a, b) => a.start - b.start);
  const first = heats[0] as Cycle;
  const last = heats.findLast((cycle) => cycle.end === runEnd(heats)) as Cycle;
  const before = first.on.beforeW;
  const after = levelAfter(series, end);
  const base = after === null ? before : Math.min(before, after);
  const joules = powers(series, first.start, end).reduce(
    (sum, watts) => sum + Math.max(watts - base, 0),
    0,
  );
  const heatsWh = heats.reduce((sum, cycle) => sum + cycle.energyWh, 0);
  return {
    ...first,
    off: last.off,
    end,
    durationS: end - first.start,
    // Never less than the heatings alone.
    energyWh: Math.max(heatsWh, Math.round(joules / 3600)),
    states: [{ from: first.start, powerW: first.powerW }],
    heats: {
      count: heats.length,
      onS: heats.reduce((sum, cycle) => sum + cycle.durationS, 0),
    },
  };
}

/** The cycles with each programme made one; in start order. Needs the series for the tails. */
export function mergeProgrammes(cycles: readonly Cycle[], series: SecondsSeries): Cycle[] {
  const sorted = [...cycles].sort((a, b) => a.start - b.start);
  const runs: Cycle[][] = [];
  for (const cycle of sorted.filter(isHeat)) {
    const run = runs.findLast(
      (list) => cycle.start - runEnd(list) <= MAX_HEAT_GAP_S && samePower(cycle, list[0] as Cycle),
    );
    if (run) run.push(cycle);
    else runs.push([cycle]);
  }
  const taken = new Set<Cycle>();
  const programmes: Cycle[] = [];
  const heatings = sorted.filter(isHeat);
  for (const run of runs) {
    const heatsEnd = runEnd(run);
    // The tail stops where another appliance starts heating.
    const next = heatings.find((cycle) => cycle.start >= heatsEnd && !run.includes(cycle));
    const until = next?.start ?? Infinity;
    const end = Math.max(heatsEnd, tailEnd(series, heatsEnd, (run[0] as Cycle).on.beforeW, until));
    const only = run[0] as Cycle;
    const single = run.length === 1;
    if (single && (only.durationS < SINGLE_HEAT_S || end - heatsEnd < MIN_TAIL_S)) continue;
    const start = only.start;
    const inside = sorted.filter(
      (cycle) =>
        !run.includes(cycle) &&
        !taken.has(cycle) &&
        cycle.start >= start &&
        cycle.end <= end &&
        Math.abs(cycle.powerW230) < only.powerW230 / 2,
    );
    for (const cycle of [...run, ...inside]) taken.add(cycle);
    programmes.push(programme(run, end, series));
  }
  return [...sorted.filter((cycle) => !taken.has(cycle)), ...programmes].sort(
    (a, b) => a.start - b.start,
  );
}
