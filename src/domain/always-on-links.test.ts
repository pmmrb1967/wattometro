// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { linkByName, relinkAlwaysOn } from './always-on-links';

const ROUTER = { id: 'e1', name: 'Router' };
const TV = { id: 'e2', name: 'Televisão da sala' };
const item = (label: string, equipmentId: string | null = null) => ({
  id: label,
  label,
  equipmentId,
});

describe('linkByName', () => {
  it('links a name of the register in any case, with its spelling', () => {
    expect(linkByName(' router ', [ROUTER, TV])).toEqual({ label: 'Router', equipmentId: 'e1' });
    expect(linkByName('TELEVISÃO DA SALA', [ROUTER, TV])).toEqual({
      label: 'Televisão da sala',
      equipmentId: 'e2',
    });
  });

  it('leaves another name as typed, unlinked', () => {
    expect(linkByName('Box da TV', [ROUTER])).toEqual({ label: 'Box da TV', equipmentId: null });
  });
});

describe('relinkAlwaysOn', () => {
  it('follows a renamed equipment, unlinks a removed one, links a new name', () => {
    const items = [item('Router', 'e1'), item('Televisão', 'gone'), item('televisão da sala')];
    expect(relinkAlwaysOn(items, [{ id: 'e1', name: 'Router da fibra' }, TV])).toEqual([
      { id: 'Router', label: 'Router da fibra', equipmentId: 'e1' },
      { id: 'Televisão', label: 'Televisão', equipmentId: null },
      { id: 'televisão da sala', label: 'Televisão da sala', equipmentId: 'e2' },
    ]);
  });

  it('keeps the same objects when nothing changes (only the changed are written)', () => {
    const items = [item('Router', 'e1'), item('Box')];
    const next = relinkAlwaysOn(items, [ROUTER]);
    expect(next[0]).toBe(items[0]);
    expect(next[1]).toBe(items[1]);
  });
});
