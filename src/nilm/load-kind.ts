// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * How an appliance draws its current, from the non-active power its cycles
 * add to the house's (√(S² − P²), docs/readings-1s.md): a resistance (a
 * kettle, an oven, the heating of a washing machine) adds little, a motor, a
 * compressor or a transformer adds a good share of its active power.
 *
 * Measured on the real house (26 and 27/10, per-second values): resistances
 * and the induction hob 5–9 % of their active power; the fridge 31 %, the
 * dryer's drum 28 %, small motors about 36 %, a 1.5–1.9 kW appliance with a
 * transformer (a microwave) 20–25 %. The dryer's heat-pump compressor 6–18 %:
 * its electronics make it draw almost like a resistance. So the kind says how
 * the current is drawn, not what the appliance is; between the two limits, or
 * for small appliances (the non-active power moves by a few var), it is left
 * unsaid.
 */
import type { Cycle } from './cycles';
import type { CycleGroup } from './summary';

export type LoadKind = 'resistive' | 'motor';

/** Up to this share of the active power: a resistance. */
export const RESISTIVE_MAX_SHARE = 0.1;
/** From this share: a motor, a compressor or a transformer. */
export const MOTOR_MIN_SHARE = 0.15;
/** Below this, a resistance's non-active power is within the house's noise. */
export const RESISTIVE_MIN_W = 500;
/** A motor's non-active power must be at least this, var (the noise of a step is ~10 var). */
export const MOTOR_MIN_VAR = 30;
/** Share of a group's cycles that must agree. */
const AGREE_SHARE = 2 / 3;

export function cycleLoadKind(cycle: Pick<Cycle, 'powerW230' | 'nonActiveVar'>): LoadKind | null {
  const watts = cycle.powerW230;
  if (watts <= 0) return null;
  const share = cycle.nonActiveVar / watts;
  if (watts >= RESISTIVE_MIN_W && Math.abs(share) <= RESISTIVE_MAX_SHARE) return 'resistive';
  if (cycle.nonActiveVar >= MOTOR_MIN_VAR && share >= MOTOR_MIN_SHARE) return 'motor';
  return null;
}

/**
 * The kind most of a group's cycles agree on (two thirds), or null. Whole
 * programmes (a resistance and a motor) and appliances with several states are
 * left out: one kind would not describe them.
 */
export function groupLoadKind(group: CycleGroup): LoadKind | null {
  if (group.heats !== null || group.statesW.length > 1) return null;
  const counts = new Map<LoadKind | null, number>();
  for (const cycle of group.cycles) {
    const kind = cycleLoadKind(cycle);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  for (const kind of ['resistive', 'motor'] as const) {
    if ((counts.get(kind) ?? 0) >= AGREE_SHARE * group.cycles.length) return kind;
  }
  return null;
}
