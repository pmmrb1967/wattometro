// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Tarifários → "Carro elétrico": what charging at home would add to this
 * house's real year, charging in the empty period or at any hour, and which
 * offer is cheapest with the car. Pure arithmetic on the user's own figures
 * (km a year, the car's kWh per 100 km): no reference values. Losses while
 * charging are not counted (the app does not know the charger), which the
 * page says.
 */
import type { Cents } from '../lib/money';
import type { Wh } from '../lib/units';
import { electricityCost } from './electricity-cost';
import { compareOffers, energyFor, YEAR_DAYS, type AnnualUsage, type OfferResult } from './compare';
import type { Offer } from './erse';
import type { Cycle, MeterPeriod, TariffInput } from './tariff';

export interface CarInput {
  kmPerYear: number;
  /** The car's consumption, tenths of kWh per 100 km (165 = 16,5 kWh/100 km). */
  tenthsKwhPer100Km: number;
}

/** Wh a year: 0,1 kWh per 100 km is exactly 1 Wh per km. */
export function carWhPerYear(car: CarInput): Wh {
  return Math.max(0, Math.round(car.kmPerYear)) * Math.max(0, Math.round(car.tenthsKwhPer100Km));
}

/**
 * The year with the car: all in the empty period (charging at night), or
 * spread like the rest of the house (charging whenever it is plugged in).
 */
export function usageWithCar(
  usage: AnnualUsage,
  carWh: Wh,
  when: 'empty' | 'anytime',
): AnnualUsage {
  const add = (split: Record<MeterPeriod, Wh>): Record<MeterPeriod, Wh> => {
    if (when === 'empty' || usage.totalWh === 0) return { ...split, empty: split.empty + carWh };
    // Spread in the house's own proportions; the rounding rest goes to the empty period.
    const full = Math.round((carWh * split.full) / usage.totalWh);
    const peak = Math.round((carWh * split.peak) / usage.totalWh);
    return {
      empty: split.empty + carWh - full - peak,
      full: split.full + full,
      peak: split.peak + peak,
    };
  };
  const byCycle = Object.fromEntries(
    Object.entries(usage.byCycle).map(([cycle, split]) => [cycle, add(split)]),
  ) as Record<Cycle, Record<MeterPeriod, Wh>>;
  return { ...usage, totalWh: usage.totalWh + carWh, byCycle };
}

export interface CarCost {
  carWh: Wh;
  /** What the car adds to the current contract's year, with VAT. */
  emptyCents: Cents;
  anytimeCents: Cents;
  /** The cheapest offer for the house with the car charged in the empty period, or null. */
  best: OfferResult | null;
  /** The current contract's year with the car charged in the empty period (to compare with best). */
  currentWithCarCents: Cents;
}

export function carCost(
  usage: AnnualUsage,
  current: TariffInput,
  car: CarInput,
  offers: readonly Offer[],
  today: string,
): CarCost {
  const carWh = carWhPerYear(car);
  const year = (with_: AnnualUsage) =>
    electricityCost(energyFor(current.option, current.cycle, with_), YEAR_DAYS, current).totalCents;
  const base = year(usage);
  const empty = usageWithCar(usage, carWh, 'empty');
  const currentWithCarCents = year(empty);
  const comparison = compareOffers({ usage: empty, current, offers, today });
  return {
    carWh,
    emptyCents: currentWithCarCents - base,
    anytimeCents: year(usageWithCar(usage, carWh, 'anytime')) - base,
    best: comparison.results[0] ?? null,
    currentWithCarCents,
  };
}
