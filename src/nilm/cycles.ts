// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * On/off pairs (Phase 8.1): each step down is matched with the latest step up
 * still open whose size it mirrors (the same appliance switching off), within
 * MAX_CYCLE_S. A cycle has a start, a duration, a power and its energy.
 *
 * Appliances with several states (the washing machine's heating, then its
 * motor) and periodic patterns (an induction hob pulsing) come out as several
 * separate cycles for now.
 */
import type { EpochSeconds } from '../lib/time';
import type { PowerEvent } from './events';

/** Longest cycle looked for: a water heater in the empty period, an oven. */
export const MAX_CYCLE_S = 6 * 3600;

/** How far an off step may differ from its on step: 30 W, or 10 % for large ones. */
export function matchToleranceW(deltaW: number): number {
  return Math.max(30, Math.abs(deltaW) * 0.1);
}

/** For non-active power: 30 var, or 25 % (it adds up less exactly than active power). */
function matchToleranceVar(deltaVar: number): number {
  return Math.max(30, Math.abs(deltaVar) * 0.25);
}

export interface Cycle {
  on: PowerEvent;
  off: PowerEvent;
  start: EpochSeconds;
  end: EpochSeconds;
  durationS: number;
  /** Mean of the two measured steps, W. */
  powerW: number;
  /** The same scaled to 230 V (what compares across days), W. */
  powerW230: number;
  nonActiveVar: number;
  energyWh: number;
}

export function pairCycles(events: readonly PowerEvent[]): Cycle[] {
  const open: PowerEvent[] = [];
  const cycles: Cycle[] = [];
  for (const event of events) {
    if (event.deltaW230 > 0) {
      open.push(event);
      continue;
    }
    for (let index = open.length - 1; index >= 0; index--) {
      const on = open[index] as PowerEvent;
      if (event.ts - on.ts > MAX_CYCLE_S) break;
      if (
        Math.abs(on.deltaW230 + event.deltaW230) <= matchToleranceW(on.deltaW230) &&
        Math.abs(on.deltaVar + event.deltaVar) <= matchToleranceVar(on.deltaVar)
      ) {
        open.splice(index, 1);
        const durationS = event.ts - on.ts;
        // The measured steps for the energy (what the meter counted), not the 230 V ones.
        const measuredW = (on.deltaW - event.deltaW) / 2;
        cycles.push({
          on,
          off: event,
          start: on.ts,
          end: event.ts,
          durationS,
          powerW: Math.round(measuredW),
          powerW230: Math.round((on.deltaW230 - event.deltaW230) / 2),
          nonActiveVar: Math.round((on.deltaVar - event.deltaVar) / 2),
          energyWh: Math.round((measuredW * durationS) / 3600),
        });
        break;
      }
    }
  }
  return cycles.sort((a, b) => a.start - b.start);
}
