// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * What stays on (always-on.ts) and the house's equipment (equipment.ts): an
 * item named as an equipment (any case) is that equipment, and takes its name,
 * as the recognised appliances do. Renaming the equipment renames the item;
 * removing it leaves the item, unlinked. Renaming the item to another name
 * unlinks it. The same rules in the Worker (server/src/repo/always-on.ts), the
 * local mode and the demonstration.
 */
import { nameKey } from './equipment';

interface Named {
  id: string;
  name: string;
}

interface Linkable {
  label: string;
  equipmentId: string | null;
}

/** The link of an item given this label (a new item, or a changed one): by its name only. */
export function linkByName(
  label: string,
  equipment: readonly Named[],
): { label: string; equipmentId: string | null } {
  const key = nameKey(label);
  const found = equipment.find((item) => nameKey(item.name) === key);
  return found ? { label: found.name, equipmentId: found.id } : { label, equipmentId: null };
}

/**
 * The items after a change to the equipment: a linked one takes its
 * equipment's name, or is unlinked when it is gone; an unlinked one named as
 * an equipment is linked to it. The same objects when nothing changes.
 */
export function relinkAlwaysOn<T extends Linkable>(
  items: readonly T[],
  equipment: readonly Named[],
): T[] {
  return items.map((item) => {
    const linked =
      item.equipmentId === null
        ? undefined
        : equipment.find((each) => each.id === item.equipmentId);
    const next = linked
      ? { label: linked.name, equipmentId: linked.id }
      : linkByName(item.label, equipment);
    return next.label === item.label && next.equipmentId === item.equipmentId
      ? item
      : { ...item, ...next };
  });
}
