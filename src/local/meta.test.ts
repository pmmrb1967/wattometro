// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { emptyLocalData } from './data';
import { emptyMeta, SECTIONS, stampChanges, syncMetaSchema } from './meta';

const NOW = 1_800_000_000;

describe('stampChanges', () => {
  it('marks only the changed section', () => {
    const before = emptyLocalData();
    const stamped = stampChanges(before, { ...before, zone: 'B' }, emptyMeta(), NOW);
    expect(stamped.stamps.zone).toBe(NOW);
    for (const section of SECTIONS.filter((s) => s !== 'zone')) {
      expect(stamped.stamps[section]).toBe(0);
    }
  });

  it('alwaysOn changes stamp the equipment section', () => {
    const before = emptyLocalData();
    const after = {
      ...before,
      alwaysOn: [{ id: 'a', name: 'Router', watts: 10 }] as unknown as typeof before.alwaysOn,
    };
    const stamped = stampChanges(before, after, emptyMeta(), NOW);
    expect(stamped.stamps.equipment).toBe(NOW);
    expect(stamped.stamps.zone).toBe(0);
  });
});

describe('syncMetaSchema', () => {
  it('rejects a missing section', () => {
    const meta = emptyMeta();
    const stamps: Partial<typeof meta.stamps> = { ...meta.stamps };
    delete stamps.zone;
    expect(syncMetaSchema.safeParse({ ...meta, stamps }).success).toBe(false);
    expect(syncMetaSchema.safeParse(meta).success).toBe(true);
  });
});
