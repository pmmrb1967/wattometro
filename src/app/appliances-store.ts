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
    const outcome = await updateAppliance(plan.appliance.id, { durations: plan.durations });
    if (outcome.ok) {
      const { minS, maxS } = plan.durations;
      set({
        kind: 'ready',
        appliances: ready().map((item) =>
          item.id === plan.appliance.id
            ? { ...item, minDurationS: minS, maxDurationS: maxS }
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
