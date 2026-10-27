// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * From a day's steps to its cycles, as every view uses them: on/off pairs
 * (cycles.ts), runs of pulses made one (periodic.ts), each cycle's energy
 * kept to what was drawn (energy.ts), whole programmes made one
 * (programmes.ts).
 */
import { pairCycles, type Cycle } from './cycles';
import { boundCycleEnergy } from './energy';
import type { PowerEvent } from './events';
import { mergePulses } from './periodic';
import { mergeProgrammes } from './programmes';
import type { SecondsSeries } from './series';

export function findCycles(events: readonly PowerEvent[], series: SecondsSeries): Cycle[] {
  const cycles = boundCycleEnergy(mergePulses(pairCycles(events), series), series);
  return mergeProgrammes(cycles, series);
}
