// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The house's named appliances (Phase 8.3), loaded once per session and shared
 * by the pages that classify cycles ("Ao segundo", "Calibrar"). They live on
 * the server (GET /v1/appliances), so every device signed in sees the same.
 */
import { useEffect, useState } from 'react';
import { nameAppliance, type ApplianceDescriptor } from '../nilm/appliances';
import {
  createAppliance,
  deleteAppliance,
  fetchAppliances,
  updateAppliance,
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

/** Loads them again: an equipment renamed or linked changed their names (equipment-store.ts). */
export function reloadAppliances(householdId: string) {
  if (household !== householdId) return;
  // Without the loading state: the pages keep showing the old list until the new one comes.
  void fetchAppliances().then((outcome) => {
    if (household === householdId && outcome.ok) {
      set({ kind: 'ready', appliances: outcome.appliances });
    }
  });
}

const ready = () => (state.kind === 'ready' ? state.appliances : []);

/**
 * Names a descriptor: an appliance with the same name and shape takes its
 * durations (another programme of it); otherwise a new appliance.
 */
export async function addAppliance(
  label: string,
  descriptor: ApplianceDescriptor,
  /** A correction ("Não é X?"): always a descriptor of its own, with this group's exact power. */
  options: { separate?: boolean } = {},
): Promise<{ ok: true } | Failure> {
  const plan = options.separate
    ? ({ kind: 'create' } as const)
    : nameAppliance(label, descriptor, ready());
  if (plan.kind === 'widen') {
    // A rhythm seen now, for an appliance that had none, is learnt with the durations.
    const learnt =
      plan.periodS !== null && (plan.appliance.periodS ?? null) === null
        ? { periodS: plan.periodS }
        : {};
    const outcome = await updateAppliance(plan.appliance.id, {
      durations: plan.durations,
      ...learnt,
    });
    if (outcome.ok) {
      const { minS, maxS } = plan.durations;
      set({
        kind: 'ready',
        appliances: ready().map((item) =>
          item.id === plan.appliance.id
            ? { ...item, minDurationS: minS, maxDurationS: maxS, ...learnt }
            : item,
        ),
      });
    }
    return outcome;
  }
  const outcome = await createAppliance({ label, ...descriptor });
  if (outcome.ok) set({ kind: 'ready', appliances: [...ready(), outcome.appliance] });
  return outcome.ok ? { ok: true } : outcome;
}

export async function renameKnownAppliance(
  id: string,
  label: string,
): Promise<{ ok: true } | Failure> {
  const outcome = await updateAppliance(id, { label });
  if (outcome.ok) {
    set({
      kind: 'ready',
      appliances: ready().map((item) => (item.id === id ? { ...item, label } : item)),
    });
    // Named as an equipment, the server linked it and gave it that name exactly.
    if (household !== null) reloadAppliances(household);
  }
  return outcome;
}

/** Durations narrowed ("Mudar o nome" with some cycles left out): this range replaces the old one. */
export async function narrowAppliance(
  id: string,
  durations: { minS: number; maxS: number },
): Promise<{ ok: true } | Failure> {
  const outcome = await updateAppliance(id, { durations });
  if (outcome.ok) {
    set({
      kind: 'ready',
      appliances: ready().map((item) =>
        item.id === id
          ? { ...item, minDurationS: durations.minS, maxDurationS: durations.maxS }
          : item,
      ),
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
