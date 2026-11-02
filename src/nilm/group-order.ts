// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The order of a day's groups in "Ao segundo". Energy has no order of its own:
 * it is what the cost follows, and the cost falls back on it without a tariff.
 * Power is apart because it says nothing of the cost: a 2 kW kettle can cost
 * less in a day than 100 W left on.
 */
import type { CycleGroup } from './summary';

export const GROUP_ORDERS = ['cost', 'time', 'power', 'duration'] as const;
export type GroupOrder = (typeof GROUP_ORDERS)[number];

export function parseGroupOrder(value: string | null): GroupOrder {
  return GROUP_ORDERS.find((order) => order === value) ?? 'cost';
}

interface Row {
  group: CycleGroup;
  costCents: number | null;
}

const firstStart = ({ group }: Row) => group.cycles[0]?.start ?? 0;

const compare: Record<GroupOrder, (a: Row, b: Row) => number> = {
  cost: (a, b) => (b.costCents ?? 0) - (a.costCents ?? 0) || b.group.energyWh - a.group.energyWh,
  // A group that returned goes where it first appeared; its other times are in its list.
  time: (a, b) => firstStart(a) - firstStart(b),
  power: (a, b) => Math.abs(b.group.powerW) - Math.abs(a.group.powerW),
  duration: (a, b) => b.group.durationS - a.group.durationS,
};

/** A new list; groups that tie stay in the default order, the dearest first. */
export function sortGroups<T extends Row>(rows: readonly T[], order: GroupOrder): T[] {
  return [...rows].sort((a, b) => compare[order](a, b) || compare.cost(a, b));
}
