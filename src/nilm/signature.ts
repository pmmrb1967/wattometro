// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * What a calibration (Phase 8.2) caught: of the cycles in the copied minutes
 * (a minute beyond each side of what the user marked), the one that ran most
 * inside the marked run — the appliance the user switched on and off. Its
 * steps are the appliance's descriptor (power, non-active power, transient).
 * The clicks may come a little after the appliance switched, so the run is
 * widened by SLACK_S on each side.
 */
import type { EpochSeconds } from '../lib/time';
import { pairCycles, type Cycle } from './cycles';
import { detectEvents } from './events';
import { mergePulses } from './periodic';
import { toSeries, type MinuteSeconds } from './series';

export const SLACK_S = 60;

/** Seconds a cycle shares with [from, to). */
const overlap = (cycle: Cycle, from: number, to: number) =>
  Math.max(0, Math.min(cycle.end, to) - Math.max(cycle.start, from));

export function signatureCycle(
  minutes: readonly MinuteSeconds[],
  from: EpochSeconds,
  to: EpochSeconds,
): Cycle | null {
  if (minutes.length === 0) return null;
  const first = Math.min(...minutes.map((minute) => minute.ts));
  const end = Math.max(...minutes.map((minute) => minute.ts)) + 60;
  const cycles = mergePulses(pairCycles(detectEvents(toSeries(minutes, first, end))));
  const wide = { from: from - SLACK_S, to: to + SLACK_S };
  let best: Cycle | null = null;
  let bestScore = 0;
  for (const cycle of cycles) {
    // Time inside the run, weighted by power: the fridge cycling meanwhile loses to the kettle.
    const score = overlap(cycle, wide.from, wide.to) * Math.abs(cycle.powerW);
    if (score > bestScore) {
      best = cycle;
      bestScore = score;
    }
  }
  return best;
}
