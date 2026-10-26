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
 * groupCycles) and its power is within matchToleranceW of the appliance's,
 * a little wider than a day's grouping: the same fridge varies more from day
 * to day than within one. With two that fit, the closest power wins.
 */
import { MISSING, type SecondsSeries } from './series';
import type { Cycle } from './cycles';
import type { CycleGroup } from './summary';

export interface ApplianceDescriptor {
  /** Power of its cycles at 230 V (the first state), W. */
  powerW: number;
  /** Measured power of each state, in order (one for most appliances), W. */
  statesW: number[];
  pulsing: boolean;
}

export interface Appliance extends ApplianceDescriptor {
  id: string;
  label: string;
}

/**
 * 25 W, or 5 %: a little wider than a day's grouping (20 W or 3 %), for the
 * variation between days, but narrow enough that a 150 W television is not a
 * 110 W fridge.
 */
export function matchToleranceW(powerW: number): number {
  return Math.max(25, Math.abs(powerW) * 0.05);
}

export function describeGroup(group: CycleGroup): ApplianceDescriptor {
  return { powerW: group.powerW, statesW: group.statesW, pulsing: group.pulsing };
}

export function describeCycle(cycle: Cycle): ApplianceDescriptor {
  return {
    powerW: cycle.powerW230,
    statesW: cycle.states.map((state) => state.powerW),
    pulsing: cycle.pulses !== undefined,
  };
}

/** How far a cycle is from an appliance, W; null when it does not fit. */
function distance(cycle: Cycle, appliance: ApplianceDescriptor): number | null {
  if ((cycle.pulses !== undefined) !== appliance.pulsing) return null;
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
      if (gap !== null && gap < bestGap) {
        best = appliance;
        bestGap = gap;
      }
    }
    if (best) named.set(cycle.start, best);
  }
  return named;
}

/** The appliance most of a group's cycles are, or null. */
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
  return best?.appliance ?? null;
}

/** Energy the per-second values show over the day, Wh (missing seconds count as nothing). */
export function seriesEnergyWh(series: SecondsSeries): number {
  let joules = 0;
  for (const watts of series.power) if (watts !== MISSING && watts > 0) joules += watts;
  return Math.round(joules / 3600);
}

export interface ApplianceTotal {
  appliance: Appliance;
  cycles: number;
  energyWh: number;
}

/**
 * Energy per named appliance, the most first, and the share of the day's
 * energy they explain: an honest measure of how far the naming goes (the
 * baseload and what nobody named are the rest).
 */
export function applianceTotals(
  cycles: readonly Cycle[],
  named: ReadonlyMap<number, Appliance>,
  dayEnergyWh: number,
): { totals: ApplianceTotal[]; explainedPct: number | null } {
  const totals = new Map<string, ApplianceTotal>();
  for (const cycle of cycles) {
    const appliance = named.get(cycle.start);
    if (!appliance) continue;
    const total = totals.get(appliance.id) ?? { appliance, cycles: 0, energyWh: 0 };
    total.cycles++;
    total.energyWh += cycle.energyWh;
    totals.set(appliance.id, total);
  }
  const list = [...totals.values()].sort((a, b) => b.energyWh - a.energyWh);
  const explained = list.reduce((sum, total) => sum + total.energyWh, 0);
  return {
    totals: list,
    explainedPct:
      dayEnergyWh > 0 ? Math.min(100, Math.round((100 * explained) / dayEnergyWh)) : null,
  };
}
