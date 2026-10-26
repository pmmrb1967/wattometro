// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Keeping the cycles' energy to what the house drew. A cycle's energy is its
 * power times its duration, which is wrong when a step was missed: small steps
 * (30–40 W) sit at the detector's floor, and an on paired with an off hours
 * later counts the appliance as on all that time. On the real house (26/10),
 * 128 cycles of 33 W added up to about 70 hours in a 21-hour day.
 *
 * boundCycleEnergy: second by second, a cycle can only count what the house
 * drew above its level before the cycle, and never more than its own power.
 * Uses of a pulsing appliance are left alone: mergePulses caps them already,
 * and two plates on at once draw twice the power of one.
 *
 * overlapCappedWh: cycles of one group, or of one appliance, that overlap
 * count each second once (the same appliance cannot be on twice).
 */
import type { Cycle } from './cycles';
import { MISSING, type SecondsSeries } from './series';

export function boundCycleEnergy(cycles: readonly Cycle[], series: SecondsSeries): Cycle[] {
  return cycles.map((cycle) => {
    if (cycle.pulses !== undefined) return cycle;
    const ceiling = Math.max(...cycle.states.map((state) => state.powerW), cycle.powerW);
    const first = Math.max(0, cycle.start - series.start);
    const last = Math.min(series.power.length, cycle.end - series.start);
    let joules = 0;
    for (let index = first; index < last; index++) {
      const watts = series.power[index] as number;
      if (watts === MISSING) continue;
      joules += Math.min(Math.max(watts - cycle.on.beforeW, 0), ceiling);
    }
    const drawnWh = Math.round(joules / 3600);
    return drawnWh < cycle.energyWh ? { ...cycle, energyWh: drawnWh } : cycle;
  });
}

/** Seconds covered by at least one of the cycles. */
function coveredSeconds(cycles: readonly Cycle[]): number {
  const sorted = [...cycles].sort((a, b) => a.start - b.start);
  let covered = 0;
  let end = -Infinity;
  for (const cycle of sorted) {
    if (cycle.end <= end) continue;
    covered += cycle.end - Math.max(cycle.start, end);
    end = cycle.end;
  }
  return covered;
}

/** The cycles' energy, at most `powerW` for every second one of them covers, Wh. */
export function overlapCappedWh(cycles: readonly Cycle[], powerW: number): number {
  const sum = cycles.reduce((total, cycle) => total + cycle.energyWh, 0);
  // Pulsing uses already count only what was drawn (two plates at once included).
  if (cycles.some((cycle) => cycle.pulses !== undefined)) return sum;
  return Math.min(sum, Math.round((Math.abs(powerW) * coveredSeconds(cycles)) / 3600));
}
