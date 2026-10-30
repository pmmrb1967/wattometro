// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Naming appliances (Phase 8.3). An appliance is a name and a descriptor: the
 * power of its cycles at 230 V, the measured power of each state, and whether
 * it pulses. The user names a group of cycles once ("O que é?"), or a
 * calibration gives it; from then on every cycle that fits a descriptor, on any
 * day, is that appliance (classify). Kept on the server (GET /v1/appliances),
 * so every device the user signs in on knows them.
 *
 * A cycle fits when it has the same shape (the states and pulses, as in
 * groupCycles), its power is within matchToleranceW of the appliance's, a
 * little wider than a day's grouping (the same fridge varies more from day to
 * day than within one), and its duration is within the appliance's range:
 * appliances of about 2 kW differ mostly in how long they stay on (a kettle
 * 3 minutes, a washing machine heating for 11). With two that fit, the
 * closest power wins, and on a tie the one named last (a correction).
 *
 * Programmes differ (a washing machine at 30 °C heats for less than at
 * 60 °C), so the range starts at half to twice what was seen and widens with
 * every cycle the user names the same (nameAppliance). A programme of
 * another shape becomes a second descriptor with the same name; the energy
 * adds up by name (applianceTotals). A whole programme (programmes.ts) fits
 * only an appliance with as many heatings: a dishwasher heating four times is
 * not a washing machine heating once.
 */
import { QUARTER_HOUR } from '../lib/time';
import { MISSING, type SecondsSeries } from './series';
import type { Cycle } from './cycles';
import { overlapCappedWh } from './energy';
import type { CycleGroup } from './summary';

export interface ApplianceDescriptor {
  /** Power of its cycles at 230 V (the first state), W. */
  powerW: number;
  /** Measured power of each state, in order (one for most appliances), W. */
  statesW: number[];
  pulsing: boolean;
  /** Range of its cycles' durations, s; null (named before there were ranges) fits any. */
  minDurationS: number | null;
  maxDurationS: number | null;
  /** Heatings of a whole programme (programmes.ts); null for any other cycle. */
  heats: number | null;
}

export interface Appliance extends ApplianceDescriptor {
  id: string;
  label: string;
  /** When it was named, epoch s: on a tie, the latest naming wins (a correction). */
  createdAt?: number;
}

/**
 * 25 W, or 5 %: a little wider than a day's grouping (20 W or 3 %), for the
 * variation between days, but narrow enough that a 150 W television is not a
 * 110 W fridge.
 */
export function matchToleranceW(powerW: number): number {
  return Math.max(25, Math.abs(powerW) * 0.05);
}

/** Half the shortest to twice the longest seen: room for the programmes not seen yet. */
export function durationRange(durationsS: readonly number[]): { minS: number; maxS: number } {
  return {
    minS: Math.max(1, Math.floor(Math.min(...durationsS) / 2)),
    maxS: Math.ceil(Math.max(...durationsS) * 2),
  };
}

export function describeGroup(group: CycleGroup): ApplianceDescriptor {
  const { minS, maxS } = durationRange(group.cycles.map((cycle) => cycle.durationS));
  return {
    powerW: group.powerW,
    statesW: group.statesW,
    pulsing: group.pulsing,
    minDurationS: minS,
    maxDurationS: maxS,
    heats: group.heats,
  };
}

export function describeCycle(cycle: Cycle): ApplianceDescriptor {
  const { minS, maxS } = durationRange([cycle.durationS]);
  return {
    powerW: cycle.powerW230,
    statesW: cycle.states.map((state) => state.powerW),
    pulsing: cycle.pulses !== undefined,
    minDurationS: minS,
    maxDurationS: maxS,
    heats: cycle.heats?.count ?? null,
  };
}

/** Same shape and power, whatever the duration: the same appliance in another programme. */
function sameShape(a: ApplianceDescriptor, b: ApplianceDescriptor): boolean {
  return (
    a.pulsing === b.pulsing &&
    a.heats === b.heats &&
    a.statesW.length === b.statesW.length &&
    a.statesW.every(
      (watts, index) =>
        index === 0 || Math.abs(watts - (b.statesW[index] as number)) <= matchToleranceW(watts),
    ) &&
    Math.abs(a.powerW - b.powerW) <= matchToleranceW(a.powerW)
  );
}

/**
 * Two descriptors the classification cannot keep apart: the same shape and
 * power, and durations that overlap (a washing machine and a dishwasher both
 * heating water at 2 kW for about 10 minutes).
 */
export function confusable(a: ApplianceDescriptor, b: ApplianceDescriptor): boolean {
  if (!sameShape(a, b)) return false;
  if (a.minDurationS === null || a.maxDurationS === null) return true;
  if (b.minDurationS === null || b.maxDurationS === null) return true;
  return a.minDurationS <= b.maxDurationS && b.minDurationS <= a.maxDurationS;
}

const sameLabel = (a: string, b: string) =>
  a.trim().toLocaleLowerCase('pt') === b.trim().toLocaleLowerCase('pt');

/**
 * What naming a descriptor does: widen the durations of an appliance with the
 * same name and shape (another programme), or create a new one.
 */
export function nameAppliance(
  label: string,
  descriptor: ApplianceDescriptor,
  appliances: readonly Appliance[],
):
  | { kind: 'widen'; appliance: Appliance; durations: { minS: number; maxS: number } }
  | { kind: 'create' } {
  const same = appliances.find(
    (appliance) => sameLabel(appliance.label, label) && sameShape(appliance, descriptor),
  );
  if (!same) return { kind: 'create' };
  const seen = [descriptor.minDurationS, descriptor.maxDurationS];
  // Without a range yet, the one named now is it.
  const current =
    same.minDurationS !== null && same.maxDurationS !== null
      ? [same.minDurationS, same.maxDurationS]
      : [];
  const all = [...seen, ...current].filter((value): value is number => value !== null);
  if (all.length === 0) return { kind: 'create' };
  return {
    kind: 'widen',
    appliance: same,
    durations: { minS: Math.min(...all), maxS: Math.max(...all) },
  };
}

/** How far a cycle is from an appliance, W; null when it does not fit. */
function distance(cycle: Cycle, appliance: ApplianceDescriptor): number | null {
  if ((cycle.pulses !== undefined) !== appliance.pulsing) return null;
  if ((cycle.heats?.count ?? null) !== appliance.heats) return null;
  if (appliance.minDurationS !== null && cycle.durationS < appliance.minDurationS) return null;
  if (appliance.maxDurationS !== null && cycle.durationS > appliance.maxDurationS) return null;
  if (cycle.states.length !== appliance.statesW.length) return null;
  // Later states compared as measured, as groupCycles does; the first through the 230 V power.
  for (let index = 1; index < cycle.states.length; index++) {
    const expected = appliance.statesW[index] as number;
    const state = (cycle.states[index] as { powerW: number }).powerW;
    if (Math.abs(state - expected) > matchToleranceW(expected)) return null;
  }
  const gap = Math.abs(cycle.powerW230 - appliance.powerW);
  return gap <= matchToleranceW(appliance.powerW) ? gap : null;
}

/** The appliance each cycle is, by its start; cycles that fit none are left out. */
export function classify(
  cycles: readonly Cycle[],
  appliances: readonly Appliance[],
): Map<number, Appliance> {
  const named = new Map<number, Appliance>();
  for (const cycle of cycles) {
    let best: Appliance | null = null;
    let bestGap = Infinity;
    for (const appliance of appliances) {
      const gap = distance(cycle, appliance);
      const later = (appliance.createdAt ?? 0) > (best?.createdAt ?? 0);
      if (gap !== null && (gap < bestGap || (gap === bestGap && later))) {
        best = appliance;
        bestGap = gap;
      }
    }
    if (best) named.set(cycle.start, best);
  }
  return named;
}

/**
 * The appliance most of a group's cycles are, or null when it is not at least
 * half of them: one cycle that happens to fit does not name a group whose other
 * cycles are something else (it still counts in that appliance's day).
 */
export function groupAppliance(
  group: CycleGroup,
  named: ReadonlyMap<number, Appliance>,
): Appliance | null {
  const counts = new Map<string, { appliance: Appliance; count: number }>();
  for (const cycle of group.cycles) {
    const appliance = named.get(cycle.start);
    if (!appliance) continue;
    const entry = counts.get(appliance.id) ?? { appliance, count: 0 };
    entry.count++;
    counts.set(appliance.id, entry);
  }
  let best: { appliance: Appliance; count: number } | null = null;
  for (const entry of counts.values()) if (!best || entry.count > best.count) best = entry;
  if (!best || best.count * 2 < group.cycles.length) return null;
  return best.appliance;
}

/** Energy the per-second values show over the day, Wh (missing seconds count as nothing). */
export function seriesEnergyWh(series: SecondsSeries): number {
  let joules = 0;
  for (const watts of series.power) if (watts !== MISSING && watts > 0) joules += watts;
  return Math.round(joules / 3600);
}

/** The series' energy by quarter hour (by its start), Wh; the series starts on a quarter. */
export function seriesQuarters(series: SecondsSeries): { ts: number; energyWh: number }[] {
  const quarters: { ts: number; energyWh: number }[] = [];
  for (let from = 0; from < series.power.length; from += QUARTER_HOUR) {
    let joules = 0;
    const to = Math.min(series.power.length, from + QUARTER_HOUR);
    for (let index = from; index < to; index++) {
      const watts = series.power[index] as number;
      if (watts !== MISSING && watts > 0) joules += watts;
    }
    quarters.push({ ts: series.start + from, energyWh: Math.round(joules / 3600) });
  }
  return quarters;
}

export interface ApplianceTotal {
  appliance: Appliance;
  cycles: number;
  energyWh: number;
  /** When it was on: its cycles' spans (for the hour of each, src/domain/appliance-cost.ts). */
  spans: { start: number; end: number }[];
}

/**
 * Energy per named appliance, the most first, and the share of the day's
 * energy they explain: an honest measure of how far the naming goes (the
 * baseload and what nobody named are the rest). Descriptors with the same
 * name (programmes of another shape) add up as one appliance; cycles of one
 * descriptor that overlap count each second once (overlapCappedWh).
 */
export function applianceTotals(
  cycles: readonly Cycle[],
  named: ReadonlyMap<number, Appliance>,
  dayEnergyWh: number,
): { totals: ApplianceTotal[]; explainedPct: number | null } {
  const byDescriptor = new Map<string, { appliance: Appliance; cycles: Cycle[] }>();
  for (const cycle of cycles) {
    const appliance = named.get(cycle.start);
    if (!appliance) continue;
    const entry = byDescriptor.get(appliance.id) ?? { appliance, cycles: [] };
    entry.cycles.push(cycle);
    byDescriptor.set(appliance.id, entry);
  }
  const totals = new Map<string, ApplianceTotal>();
  for (const { appliance, cycles: own } of byDescriptor.values()) {
    const key = appliance.label.trim().toLocaleLowerCase('pt');
    const total = totals.get(key) ?? { appliance, cycles: 0, energyWh: 0, spans: [] };
    total.cycles += own.length;
    total.spans.push(...own.map(({ start, end }) => ({ start, end })));
    total.energyWh += overlapCappedWh(own, appliance.powerW);
    totals.set(key, total);
  }
  const list = [...totals.values()].sort((a, b) => b.energyWh - a.energyWh);
  const explained = list.reduce((sum, total) => sum + total.energyWh, 0);
  return {
    totals: list,
    explainedPct:
      dayEnergyWh > 0 ? Math.min(100, Math.round((100 * explained) / dayEnergyWh)) : null,
  };
}
