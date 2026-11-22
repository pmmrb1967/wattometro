// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Change stamps of the local-mode house, kept next to it (store.ts): one per
 * section, set to the time of the last change made here. They let two copies of
 * the house (this browser and the cloud one) be merged section by section.
 */
import { z } from 'zod';
import type { LocalData } from './data';

export const SECTIONS = [
  'quarters',
  'tariffs',
  'zone',
  'location',
  'budget',
  'installation',
  'equipment',
] as const;
export type Section = (typeof SECTIONS)[number];

/** Which E-Redes import the quarters belong to; a new one is started when they are deleted. */
export interface Generation {
  id: string;
  at: number;
}

export interface SyncMeta {
  /** Seconds since the epoch of the last change to each section; 0 when never changed. */
  stamps: Record<Section, number>;
  quartersGeneration: Generation;
}

const stamp = z.number().int().min(0);

export const syncMetaSchema: z.ZodType<SyncMeta> = z.object({
  stamps: z.object({
    quarters: stamp,
    tariffs: stamp,
    zone: stamp,
    location: stamp,
    budget: stamp,
    installation: stamp,
    equipment: stamp,
  }),
  quartersGeneration: z.object({ id: z.string(), at: stamp }),
});

export function emptyMeta(): SyncMeta {
  return {
    stamps: {
      quarters: 0,
      tariffs: 0,
      zone: 0,
      location: 0,
      budget: 0,
      installation: 0,
      equipment: 0,
    },
    quartersGeneration: { id: '', at: 0 },
  };
}

/** What a section holds; the equipment section also holds the always-on list that links to it. */
export function sectionValue(data: LocalData, section: Section): unknown {
  return section === 'equipment'
    ? { equipment: data.equipment, alwaysOn: data.alwaysOn }
    : data[section];
}

/** The meta with `now` on every section whose content changed between the two houses. */
export function stampChanges(
  before: LocalData,
  after: LocalData,
  meta: SyncMeta,
  now: number,
): SyncMeta {
  const stamps = { ...meta.stamps };
  for (const section of SECTIONS) {
    if (
      JSON.stringify(sectionValue(before, section)) !== JSON.stringify(sectionValue(after, section))
    ) {
      stamps[section] = now;
    }
  }
  return { ...meta, stamps };
}

export function newGeneration(now: number): Generation {
  return { id: crypto.randomUUID(), at: now };
}
