// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The house's named appliances (Phase 8.3), loaded once per session and shared
 * by the pages that classify cycles ("Ao segundo", "Calibrar"). They live on
 * the server (GET /v1/appliances), so every device signed in sees the same.
 */
import { useEffect, useState } from 'react';
import {
  createAppliance,
  deleteAppliance,
  fetchAppliances,
  renameAppliance,
  type Appliance,
  type Failure,
} from './api';

type State = { kind: 'loading' } | { kind: 'ready'; appliances: Appliance[] } | { kind: 'error' };

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
  loading = fetchAppliances().then((outcome) => {
    loading = null;
    if (household !== householdId) return;
    set(outcome.ok ? { kind: 'ready', appliances: outcome.appliances } : { kind: 'error' });
  });
}

const ready = () => (state.kind === 'ready' ? state.appliances : []);

export async function addAppliance(
  input: Parameters<typeof createAppliance>[0],
): Promise<{ ok: true; appliance: Appliance } | Failure> {
  const outcome = await createAppliance(input);
  if (outcome.ok) set({ kind: 'ready', appliances: [...ready(), outcome.appliance] });
  return outcome;
}

export async function renameKnownAppliance(
  id: string,
  label: string,
): Promise<{ ok: true } | Failure> {
  const outcome = await renameAppliance(id, label);
  if (outcome.ok) {
    set({
      kind: 'ready',
      appliances: ready().map((item) => (item.id === id ? { ...item, label } : item)),
    });
  }
  return outcome;
}

export async function forgetAppliance(id: string): Promise<{ ok: true } | Failure> {
  const outcome = await deleteAppliance(id);
  if (outcome.ok) set({ kind: 'ready', appliances: ready().filter((item) => item.id !== id) });
  return outcome;
}

export function useAppliances(householdId: string): State {
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
