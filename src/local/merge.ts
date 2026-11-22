// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Merge of the house snapshots of several devices (docs/superpowers/specs/
 * 2026-11-22-local-cloud-sync-design.md, "Juntar"). Pure: the result is the same
 * whichever snapshot is "mine" and whatever the order of the others.
 *
 * - Quarters: the newest generation wins and only its quarters are united; for the
 *   same start, the snapshot with the larger quarters stamp wins (then deviceId).
 * - Every other section: the whole section of the snapshot with the larger stamp
 *   (a tie between non-zero stamps goes to the larger deviceId).
 * - A stamp, or the start of a quarters generation, more than a day ahead of
 *   `now` counts as `now`, so a wrong clock cannot win forever. A generation
 *   kept like that may then carry different starts on different devices: it is
 *   the same one (same id) and counts with the earliest of them.
 */
import { emptyLocalData, withQuarters, type LocalData } from './data';
import { SECTIONS, type Generation, type Section, type SyncMeta } from './meta';

export interface HouseSnapshot {
  deviceId: string;
  data: LocalData;
  meta: SyncMeta;
}

const MAX_AHEAD_S = 86_400;

function effectiveStamp(stamp: number, now: number): number {
  return stamp > now + MAX_AHEAD_S ? now : stamp;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareGenerations(a: Generation, b: Generation): number {
  return a.at - b.at || compareText(a.id, b.id);
}

/**
 * The newest of these generations, each start capped as the stamps are (a
 * generation found with several starts counts with the earliest); null when none.
 */
export function newestGeneration(
  generations: readonly Generation[],
  now: number,
): Generation | null {
  const starts = new Map<string, number>();
  for (const generation of generations) {
    const at = effectiveStamp(generation.at, now);
    const known = starts.get(generation.id);
    starts.set(generation.id, known === undefined ? at : Math.min(known, at));
  }
  let best: Generation | null = null;
  for (const [id, at] of starts) {
    const current = { id, at };
    if (best === null || compareGenerations(current, best) > 0) best = current;
  }
  return best;
}

export function mergeHouses(
  mine: HouseSnapshot,
  theirs: readonly HouseSnapshot[],
  now: number,
): { data: LocalData; meta: SyncMeta } {
  const all = [mine, ...theirs];
  const stampOf = (snapshot: HouseSnapshot, section: Section) =>
    effectiveStamp(snapshot.meta.stamps[section], now);
  // Ascending: the last one is the winner.
  const bySection = (section: Section) =>
    [...all].sort(
      (a, b) => stampOf(a, section) - stampOf(b, section) || compareText(a.deviceId, b.deviceId),
    );

  const data: LocalData = emptyLocalData();
  const stamps = {} as Record<Section, number>;

  for (const section of SECTIONS) {
    if (section === 'quarters') continue;
    const winner = bySection(section).at(-1) ?? mine;
    stamps[section] = stampOf(winner, section);
    if (section === 'equipment') {
      data.equipment = winner.data.equipment;
      data.alwaysOn = winner.data.alwaysOn;
    } else {
      Object.assign(data, { [section]: winner.data[section] });
    }
  }

  const generation =
    newestGeneration(
      all.map((snapshot) => snapshot.meta.quartersGeneration),
      now,
    ) ?? mine.meta.quartersGeneration;
  const sameGeneration = bySection('quarters').filter(
    (snapshot) => snapshot.meta.quartersGeneration.id === generation.id,
  );
  for (const snapshot of sameGeneration) {
    data.quarters = withQuarters(data.quarters, snapshot.data.quarters);
  }
  stamps.quarters = Math.max(...sameGeneration.map((snapshot) => stampOf(snapshot, 'quarters')));

  return { data, meta: { stamps, quartersGeneration: { ...generation } } };
}
