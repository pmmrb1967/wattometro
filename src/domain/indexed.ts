// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Indexed offers (docs/omie.md): the ERSE gives one estimated price per period
 * for each, as for a fixed-price offer. An offer priced at each quarter hour's
 * OMIE price ("dynamic") costs a household more or less than that, depending on
 * when it consumes: the profile effect is the household's OMIE price, weighted
 * by its consumption, minus the plain average over the same quarter hours,
 * added to the ERSE price of each period. An offer priced at the month's
 * average OMIE ("average") does not depend on the hours, and keeps the ERSE
 * price. Network losses on the effect are left out (they would add ~15 %).
 */
import { z } from 'zod';
import rulesFile from '../data/indexed-offers.json';
import { omieToMicro, type MicroEuros } from '../lib/money';
import { lisbonDate, type EpochSeconds } from '../lib/time';
import type { Wh } from '../lib/units';
import type { Offer } from './erse';
import { omiePrice, type OmieFile } from './omie';
import type { BillingPeriod, Cycle, MeterPeriod, PeriodsMap, TariffOption } from './tariff';
import { meterPeriod } from './time-cycles';

export type IndexedKind = 'dynamic' | 'average';

const rulesSchema = z.object({
  source: z.string(),
  consulted: z.string(),
  rules: z.array(
    z.object({ supplier: z.string(), name: z.string(), kind: z.enum(['dynamic', 'average']) }),
  ),
});
const { rules } = rulesSchema.parse(rulesFile);

/**
 * How an indexed offer follows the OMIE (src/data/indexed-offers.json), or
 * null for a fixed-price offer and for an indexed one whose formula does not say.
 */
export function indexedKind(offer: Offer): IndexedKind | null {
  if (!offer.indexedPrices) return null;
  const name = offer.name.toLocaleLowerCase('pt');
  const rule = rules.find(
    (item) => item.supplier === offer.supplier && name.includes(item.name.toLocaleLowerCase('pt')),
  );
  return rule?.kind ?? null;
}

/** Sums over the quarter hours of one meter period. */
interface Sums {
  /** Σ energy (Wh) and Σ energy × price (Wh × cents/MWh). */
  energyWh: Wh;
  weighted: number;
  /** Σ price and how many quarter hours (the plain average). */
  prices: number;
  count: number;
}

const emptySums = (): Sums => ({ energyWh: 0, weighted: 0, prices: 0, count: 0 });
const emptySplit = (): Record<MeterPeriod, Sums> => ({
  empty: emptySums(),
  full: emptySums(),
  peak: emptySums(),
});

function add(into: Sums, from: Sums): Sums {
  return {
    energyWh: into.energyWh + from.energyWh,
    weighted: into.weighted + from.weighted,
    prices: into.prices + from.prices,
    count: into.count + from.count,
  };
}

/** Weighted minus plain average, cents per MWh; 0 without consumption. */
function effectOf(sums: Sums): number {
  if (sums.energyWh <= 0 || sums.count === 0) return 0;
  return sums.weighted / sums.energyWh - sums.prices / sums.count;
}

export interface MonthPrice {
  /** "2026-07" (Lisbon). */
  month: string;
  /** Plain average OMIE price of the month, cents per MWh. */
  average: number;
}

export interface ProfileEffect {
  /** Quarter hours with both consumption and an OMIE price. */
  quarters: number;
  /** The household's OMIE price (weighted by its consumption) and the plain average, cents/MWh. */
  weighted: number;
  average: number;
  /** µ€/kWh to add to each period's ERSE price of a dynamic offer. */
  adjust(option: TariffOption, cycle: Cycle): Partial<Record<BillingPeriod, MicroEuros>>;
  /** Plain average of each whole month in the quarter hours, oldest first. */
  months: MonthPrice[];
}

/** Below a month of overlap the effect says too little. */
const MIN_QUARTERS = 30 * 96;

/** The profile effect of the quarter hours, or null with less than a month priced. */
export function profileEffect(
  quarters: readonly { ts: EpochSeconds; energyWh: Wh }[],
  omie: OmieFile,
  map: PeriodsMap,
): ProfileEffect | null {
  const split: Record<Cycle, Record<MeterPeriod, Sums>> = {
    daily: emptySplit(),
    weekly: emptySplit(),
  };
  const byMonth = new Map<string, { prices: number; count: number }>();
  let total = emptySums();
  for (const { ts, energyWh } of quarters) {
    const price = omiePrice(omie, ts);
    if (price === null) continue;
    const one: Sums = { energyWh, weighted: energyWh * price, prices: price, count: 1 };
    total = add(total, one);
    for (const cycle of ['daily', 'weekly'] as const) {
      const period = meterPeriod(ts, cycle, map);
      split[cycle][period] = add(split[cycle][period], one);
    }
    const month = lisbonDate(ts).slice(0, 7);
    const sums = byMonth.get(month) ?? { prices: 0, count: 0 };
    byMonth.set(month, { prices: sums.prices + price, count: sums.count + 1 });
  }
  if (total.count < MIN_QUARTERS || total.energyWh <= 0) return null;

  // Whole months only: a month's first and last days decide nothing alone.
  const counts = [...byMonth.values()].map((sums) => sums.count);
  const whole = Math.max(...counts) * 0.9;
  const months = [...byMonth.entries()]
    .filter(([, sums]) => sums.count >= whole)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, sums]) => ({ month, average: sums.prices / sums.count }));

  const micro = (sums: Sums) => omieToMicro(effectOf(sums));
  return {
    quarters: total.count,
    weighted: total.weighted / total.energyWh,
    average: total.prices / total.count,
    months,
    adjust(option, cycle) {
      if (option === 'simple') return { simple: micro(total) };
      const { empty, full, peak } = split[cycle];
      return option === 'bi'
        ? { empty: micro(empty), offEmpty: micro(add(full, peak)) }
        : { empty: micro(empty), full: micro(full), peak: micro(peak) };
    },
  };
}

/** The adjustment compareOffers applies: the profile effect, on dynamic offers only. */
export function dynamicAdjust(effect: ProfileEffect | null) {
  if (!effect) return undefined;
  return (offer: Offer, option: TariffOption, cycle: Cycle) =>
    indexedKind(offer) === 'dynamic' ? effect.adjust(option, cycle) : null;
}
