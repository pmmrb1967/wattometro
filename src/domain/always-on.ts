// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * What the household says stays on day and night (the card "Consumo base"), to
 * set against the baseload measured (baseload.ts). The quarter hours only know
 * the sum, so the watts here are the user's: measured with a plug meter or
 * their estimate. There are no typical values: an item without a power stays
 * listed and counts for nothing, and the rest of the base stays unexplained.
 *
 * The base is a low value of the night, so what switches on and off, such as a
 * fridge, is only partly in it: on 26–30/10 it sat between the level of the
 * fridge's pauses and that of the fridge running. The list can therefore add up
 * to more than the base.
 */
import { z } from 'zod';
import type { Cents } from '../lib/money';
import type { Watts, Wh } from '../lib/units';

const HOURS_PER_YEAR = 8760;
/** More than a house lists; keeps a runaway client from filling the table. */
export const MAX_ALWAYS_ON = 60;

export const alwaysOnInputSchema = z
  .object({
    label: z.string().trim().min(1).max(60),
    /** How many of them ("5 televisões"). */
    quantity: z.number().int().min(1).max(99),
    /** What each one draws, W; null when not known. */
    powerW: z.number().int().min(1).max(5000).nullable(),
    /** Read on a meter, not estimated. */
    measured: z.boolean(),
  })
  .refine(({ powerW, measured }) => powerW !== null || !measured);
export type AlwaysOnInput = z.infer<typeof alwaysOnInputSchema>;

export const alwaysOnItemSchema = alwaysOnInputSchema.and(
  z.object({
    id: z.string(),
    createdAt: z.number().int(),
    /**
     * The registered equipment it is (always-on-links.ts), whose name it takes;
     * null when none. Missing in what was kept before the link: none.
     */
    equipmentId: z.string().nullable().default(null),
  }),
);
export type AlwaysOnItem = z.infer<typeof alwaysOnItemSchema>;

/** What all of an item draw; null without a power. */
export function itemWatts(item: Pick<AlwaysOnInput, 'quantity' | 'powerW'>): Watts | null {
  return item.powerW === null ? null : item.quantity * item.powerW;
}

export interface AlwaysOnBalance {
  /** Sum of the items with a power. */
  listedW: Watts;
  /** Items without one: what they draw is in `leftW`. */
  withoutPower: number;
  /** The base the list does not explain; below zero when it adds up to more. */
  leftW: Watts;
}

export function alwaysOnBalance(
  items: readonly Pick<AlwaysOnInput, 'quantity' | 'powerW'>[],
  baseW: Watts,
): AlwaysOnBalance {
  const watts = items.map(itemWatts);
  const listedW = watts.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  return {
    listedW,
    withoutPower: watts.filter((value) => value === null).length,
    leftW: baseW - listedW,
  };
}

/** A power all year. */
export const yearWh = (watts: Watts): Wh => watts * HOURS_PER_YEAR;

/** An item's part of what the whole list costs, by its power. */
export function shareOfCost(listCents: Cents, watts: Watts, listedW: Watts): Cents {
  return listedW === 0 ? 0 : Math.round((listCents * watts) / listedW);
}
