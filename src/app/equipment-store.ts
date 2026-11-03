// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The house's equipment (src/domain/equipment.ts), loaded once per session
 * and shared by the pages that show or name appliances, as appliances-store.ts
 * does for the appliances. Saving, linking or removing one changes the
 * appliances' names or links too, so those are loaded again.
 */
import { useEffect, useState } from 'react';
import type { Equipment, EquipmentInput } from '../domain/equipment';
import {
  createEquipment,
  deleteEquipment,
  fetchEquipment,
  linkEquipment,
  updateEquipment,
  type Failure,
  type NameTaken,
} from './api';
import { reloadAppliances } from './appliances-store';

type State = { kind: 'loading' } | { kind: 'ready'; items: Equipment[] } | { kind: 'error' };

let state: State = { kind: 'loading' };
let household: string | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(next: State) {
  state = next;
  for (const listener of listeners) listener();
}

function load(householdId: string) {
  if (household === householdId && (state.kind === 'ready' || loading)) return;
  household = householdId;
  set({ kind: 'loading' });
  loading = fetchEquipment().then((outcome) => {
    loading = null;
    if (household !== householdId) return;
    set(outcome.ok ? { kind: 'ready', items: outcome.items } : { kind: 'error' });
  });
}

const ready = () => (state.kind === 'ready' ? state.items : []);
const byName = (items: Equipment[]) =>
  [...items].sort((a, b) => a.name.localeCompare(b.name, 'pt'));

/** A new equipment (id null) or a change to one; a new name renames what is linked to it. */
export async function saveEquipment(
  householdId: string,
  id: string | null,
  input: EquipmentInput,
): Promise<{ ok: true; item: Equipment } | NameTaken | Failure> {
  if (id === null) {
    const outcome = await createEquipment(input);
    if (outcome.ok) set({ kind: 'ready', items: byName([...ready(), outcome.item]) });
    return outcome;
  }
  const outcome = await updateEquipment(id, input);
  if (!outcome.ok) return outcome;
  const old = ready().find((item) => item.id === id);
  const item: Equipment = { ...input, id, createdAt: old?.createdAt ?? 0 };
  set({ kind: 'ready', items: byName(ready().map((each) => (each.id === id ? item : each))) });
  if (old && old.name !== input.name) reloadAppliances(householdId);
  return { ok: true, item };
}

export async function linkAppliances(
  householdId: string,
  id: string,
  labels: readonly string[],
): Promise<{ ok: true } | Failure> {
  const outcome = await linkEquipment(id, labels);
  if (outcome.ok) reloadAppliances(householdId);
  return outcome;
}

export async function removeEquipment(
  householdId: string,
  id: string,
): Promise<{ ok: true } | Failure> {
  const outcome = await deleteEquipment(id);
  if (outcome.ok) {
    set({ kind: 'ready', items: ready().filter((item) => item.id !== id) });
    reloadAppliances(householdId);
  }
  return outcome;
}

export function useEquipment(householdId: string): State {
  const [, rerender] = useState(0);
  useEffect(() => {
    const listener = () => rerender((count) => count + 1);
    listeners.add(listener);
    load(householdId);
    return () => {
      listeners.delete(listener);
    };
  }, [householdId]);
  return household === householdId ? state : { kind: 'loading' };
}
