// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Which of the manual's programmes a whole programme measured by the Shelly
 * probably was, and its energy against the manual's
 * (docs/superpowers/specs/2026-11-03-equipment-inventory-design.md, phase 2).
 *
 * The manual measures in test conditions (load, water temperature): the
 * difference is "compared with the manual", never a defect. Only whole
 * programmes count (cycles with heats, src/nilm/programmes.ts); one whose end
 * the detection cut is too short and comes out as no programme, not a wrong one.
 */
import type { Programme } from './equipment';

/** A programme fits a use whose duration is within this share of the programme's. */
export const PROGRAMME_TOLERANCE = 0.25;

/** The programme of the closest duration within the tolerance; the first on a tie; null when none. */
export function likelyProgramme(
  durationS: number,
  programmes: readonly Programme[],
): Programme | null {
  let best: Programme | null = null;
  let bestGap = Infinity;
  for (const programme of programmes) {
    const gap = Math.abs(durationS - programme.durationS);
    if (gap > programme.durationS * PROGRAMME_TOLERANCE) continue;
    if (gap < bestGap) {
      best = programme;
      bestGap = gap;
    }
  }
  return best;
}

/** The measured energy against the manual's, in whole percent; null without the manual's. */
export function energyDifferencePct(measuredWh: number, manualWh: number): number | null {
  if (manualWh === 0) return null;
  return Math.round(((measuredWh - manualWh) * 100) / manualWh);
}

export interface ProgrammeUse {
  start: number;
  durationS: number;
  energyWh: number;
  programme: Programme | null;
  differencePct: number | null;
}

/** The whole programmes among the cycles, latest first, each with its likely programme. */
export function programmeUses(
  cycles: readonly { start: number; durationS: number; energyWh: number; heats?: unknown }[],
  programmes: readonly Programme[],
): ProgrammeUse[] {
  return cycles
    .filter((cycle) => cycle.heats !== undefined && cycle.heats !== null)
    .map((cycle) => {
      const programme = likelyProgramme(cycle.durationS, programmes);
      return {
        start: cycle.start,
        durationS: cycle.durationS,
        energyWh: cycle.energyWh,
        programme,
        differencePct: programme ? energyDifferencePct(cycle.energyWh, programme.energyWh) : null,
      };
    })
    .sort((a, b) => b.start - a.start);
}

/** The mean difference of the uses with a programme, rounded; null when none has one. */
export function averageDifferencePct(uses: readonly ProgrammeUse[]): number | null {
  const differences = uses.flatMap((use) =>
    use.differencePct === null ? [] : [use.differencePct],
  );
  if (differences.length === 0) return null;
  return Math.round(differences.reduce((sum, value) => sum + value, 0) / differences.length);
}
