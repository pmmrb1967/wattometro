// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The register kept in memory, as the browser's servers keep it (the local
 * mode, src/local/server.ts, and the demonstration, src/demo/server.ts), with
 * the same rules as the Worker's (server/src/repo/equipment.ts): at most
 * MAX_EQUIPMENT, one of a name in any case.
 */
import { MAX_EQUIPMENT, nameKey, type Equipment, type EquipmentInput } from './equipment';

const byName = (items: Equipment[]) => items.sort((a, b) => a.name.localeCompare(b.name, 'pt'));

export function sortedEquipment(items: readonly Equipment[]): Equipment[] {
  return byName([...items]);
}

/** Of this name (any case), other than `except`. */
export function namedEquipment(
  items: readonly Equipment[],
  name: string,
  except: string | null = null,
): Equipment | null {
  const key = nameKey(name);
  return items.find((item) => item.id !== except && nameKey(item.name) === key) ?? null;
}

export function addEquipment(
  items: readonly Equipment[],
  input: EquipmentInput,
  id: string,
  createdAt: number,
): { items: Equipment[]; item: Equipment } | 'too_many' | 'name_taken' {
  if (items.length >= MAX_EQUIPMENT) return 'too_many';
  if (namedEquipment(items, input.name)) return 'name_taken';
  const item: Equipment = { ...input, id, createdAt };
  return { items: [...items, item], item };
}

export function changeEquipment(
  items: readonly Equipment[],
  id: string,
  input: EquipmentInput,
): Equipment[] | 'not_found' | 'name_taken' {
  if (!items.some((item) => item.id === id)) return 'not_found';
  if (namedEquipment(items, input.name, id)) return 'name_taken';
  return items.map((item) => (item.id === id ? { ...item, ...input } : item));
}
