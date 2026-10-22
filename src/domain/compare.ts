// SPDX-License-Identifier: AGPL-3.0-or-later
// Adapted from Faturómetro (src/domain/compare.ts): energy from quarter hours, integer units.
/**
 * Tariff simulator: the household's real consumption (quarter hours from the
 * Shelly or the E-Redes import) priced with every valid ERSE offer at the same
 * contracted power, against the current contract. Charges that do not depend on
 * the supplier (tarifa social, its financing, IEC, CAV, DGEG fee, VAT rules)
 * come from the household's own contract; prices and commercial terms from each
 * offer. An estimate for a year like the one measured, not a promise.
 */
import { eurosToMicro, type Cents } from '../lib/money';
import type { EpochSeconds } from '../lib/time';
import type { Wh } from '../lib/units';
import { electricityCost, type EnergyByPeriod, type OfferTerms } from './electricity-cost';
import { powerKey, type CycleCode, type CyclePrices, type Offer } from './erse';
import type {
  BillingPeriod,
  Cycle,
  MeterPeriod,
  PeriodsMap,
  TariffInput,
  TariffOption,
} from './tariff';
import { meterPeriod } from './time-cycles';

export const YEAR_DAYS = 365;
const QUARTERS_PER_DAY = 96;
const QUARTERS_PER_YEAR = YEAR_DAYS * QUARTERS_PER_DAY;
/** Less than a month says too little about a year. */
export const MIN_DAYS = 30;
/** From this many days on, the data is taken as a whole year (a few quarters always miss). */
const FULL_YEAR_DAYS = 360;

export interface AnnualUsage {
  /** Wh per year: total, and by period of each cycle. */
  totalWh: Wh;
  byCycle: Record<Cycle, Record<MeterPeriod, Wh>>;
  /** Days of data behind the estimate (quarter hours / 96). */
  days: number;
  /** Fewer than ~a year of data: the year is extrapolated (seasons weigh differently). */
  extrapolated: boolean;
}

const emptySplit = (): Record<MeterPeriod, Wh> => ({ empty: 0, full: 0, peak: 0 });

/** The year of consumption the quarter hours describe, or null with less than MIN_DAYS. */
export function annualUsage(
  quarters: readonly { ts: EpochSeconds; energyWh: Wh }[],
  map: PeriodsMap,
): AnnualUsage | null {
  const count = quarters.length;
  if (count < MIN_DAYS * QUARTERS_PER_DAY) return null;
  let total = 0;
  const raw: Record<Cycle, Record<MeterPeriod, Wh>> = { daily: emptySplit(), weekly: emptySplit() };
  for (const { ts, energyWh } of quarters) {
    total += energyWh;
    raw.daily[meterPeriod(ts, 'daily', map)] += energyWh;
    raw.weekly[meterPeriod(ts, 'weekly', map)] += energyWh;
  }
  const scale = (wh: Wh) => Math.round((wh * QUARTERS_PER_YEAR) / count);
  const scaled = (split: Record<MeterPeriod, Wh>) => ({
    empty: scale(split.empty),
    full: scale(split.full),
    peak: scale(split.peak),
  });
  return {
    totalWh: scale(total),
    byCycle: { daily: scaled(raw.daily), weekly: scaled(raw.weekly) },
    days: Math.floor(count / QUARTERS_PER_DAY),
    extrapolated: count < FULL_YEAR_DAYS * QUARTERS_PER_DAY,
  };
}

/** The year's energy split the way an option bills it. */
export function energyFor(option: TariffOption, cycle: Cycle, usage: AnnualUsage): EnergyByPeriod {
  if (option === 'simple') return { simple: usage.totalWh };
  const { empty, full, peak } = usage.byCycle[cycle];
  return option === 'bi' ? { empty, offEmpty: full + peak } : { empty, full, peak };
}

const OPTION_OF: Record<CycleCode, TariffOption> = { '1': 'simple', '2': 'bi', '3': 'tri' };
const CYCLES_OF: Record<TariffOption, readonly Cycle[]> = {
  simple: ['daily'],
  bi: ['daily', 'weekly'],
  tri: ['daily', 'weekly'],
};

const pct = (value: number) => Math.round(value * 100);

/** An offer's prices as a contract for the household, and its commercial terms. */
export function offerContract(
  offer: Offer,
  prices: CyclePrices,
  option: TariffOption,
  cycle: Cycle,
  household: TariffInput,
): { tariff: TariffInput; terms: OfferTerms } {
  const energy: Partial<Record<BillingPeriod, number>> = {};
  for (const period of ['simple', 'offEmpty', 'empty', 'full', 'peak'] as const) {
    const price = prices[period];
    if (price !== undefined) energy[period] = eurosToMicro(price);
  }
  return {
    tariff: {
      ...household,
      supplier: offer.supplier,
      option,
      cycle,
      fixedPerDay: eurosToMicro(prices.fixedPerDay),
      energy,
      energyDiscountBp: pct(offer.discounts.energyPct),
    },
    terms: {
      fixedDiscountBp: pct(offer.discounts.fixedTermPct),
      energyDiscountPerKwh: eurosToMicro(offer.discounts.energyPerKwh),
      discountPerYear: eurosToMicro(offer.discounts.fixedPerYear),
      servicesPerYearCents: Math.round(offer.servicesPerYearWithVat * 100),
    },
  };
}

export interface OfferResult {
  offer: Offer;
  option: TariffOption;
  /** The cheaper cycle for this household (daily for a simple option). */
  cycle: Cycle;
  annualCents: Cents;
  /** Positive: cheaper than the current contract. */
  savingCents: Cents;
}

/**
 * Energy to move to the empty period for an option to cost as much as the
 * cheapest simple choice (the current contract if it is simple, or the best
 * simple offer, whichever is cheaper).
 */
export interface Shift {
  /** The cheapest offer of the option, as it is today. */
  best: OfferResult;
  /** Wh per year to move from the other periods to empty; 0 if it is already cheaper. */
  neededWh: Wh;
  /** What it has to beat: the cheapest simple choice, cents per year. */
  targetCents: Cents;
  /** Wh per year outside the empty period (the most that could move). */
  movableWh: Wh;
}

export interface Comparison {
  currentCents: Cents;
  /** Cheapest first. */
  results: OfferResult[];
  /** Null when no offer of the option has prices at this power, or moving never pays off. */
  shift: Record<'bi' | 'tri', Shift | null>;
}

const isValid = (offer: Offer, today: string) =>
  (!offer.validFrom || offer.validFrom <= today) && (!offer.validTo || offer.validTo >= today);

/** All the energy outside empty moved to empty, keeping the other periods' proportions. */
function allToEmpty(energy: EnergyByPeriod, totalWh: Wh): EnergyByPeriod {
  return Object.fromEntries(
    Object.keys(energy).map((period) => [period, period === 'empty' ? totalWh : 0]),
  );
}

function shiftFor(
  results: OfferResult[],
  option: 'bi' | 'tri',
  usage: AnnualUsage,
  household: TariffInput,
  targetCents: Cents,
): Shift | null {
  const best = results.find((result) => result.option === option);
  if (!best) return null;
  const energy = energyFor(option, best.cycle, usage);
  const movableWh = usage.totalWh - (energy.empty ?? 0);
  if (best.annualCents <= targetCents) return { best, neededWh: 0, targetCents, movableWh };
  const prices = best.offer.prices[powerKey(household.powerVa)]?.[option === 'bi' ? '2' : '3'];
  if (!prices || movableWh <= 0) return null;
  const { tariff, terms } = offerContract(best.offer, prices, option, best.cycle, household);
  // The cost is linear in the energy moved (the total, and so the VAT split, stays the same).
  const allMoved = electricityCost(allToEmpty(energy, usage.totalWh), YEAR_DAYS, tariff, terms);
  const gainPerWh = (best.annualCents - allMoved.totalCents) / movableWh;
  if (gainPerWh <= 0) return null;
  const neededWh = Math.ceil((best.annualCents - targetCents) / gainPerWh);
  return neededWh > movableWh ? null : { best, neededWh, targetCents, movableWh };
}

export function compareOffers(input: {
  usage: AnnualUsage;
  /** The household's contract: current prices and the charges common to every offer. */
  current: TariffInput;
  offers: readonly Offer[];
  /** Lisbon day, for the offers' validity. */
  today: string;
}): Comparison {
  const { usage, current, offers, today } = input;
  const currentCents = electricityCost(
    energyFor(current.option, current.cycle, usage),
    YEAR_DAYS,
    current,
  ).totalCents;

  const key = powerKey(current.powerVa);
  const results: OfferResult[] = [];
  for (const offer of offers) {
    const byCycle = offer.prices[key];
    if (!byCycle || !isValid(offer, today)) continue;
    for (const code of ['1', '2', '3'] as const) {
      const prices = byCycle[code];
      if (!prices) continue;
      const option = OPTION_OF[code];
      let best: { cycle: Cycle; cents: Cents } | null = null;
      for (const cycle of CYCLES_OF[option]) {
        const { tariff, terms } = offerContract(offer, prices, option, cycle, current);
        let cents: Cents;
        try {
          cents = electricityCost(
            energyFor(option, cycle, usage),
            YEAR_DAYS,
            tariff,
            terms,
          ).totalCents;
        } catch {
          continue; // A price missing for one of the option's periods: not comparable.
        }
        if (!best || cents < best.cents) best = { cycle, cents };
      }
      if (best) {
        results.push({
          offer,
          option,
          cycle: best.cycle,
          annualCents: best.cents,
          savingCents: currentCents - best.cents,
        });
      }
    }
  }
  results.sort((a, b) => a.annualCents - b.annualCents || a.offer.id.localeCompare(b.offer.id));
  const bestSimple = results.find((result) => result.option === 'simple')?.annualCents;
  const simpleTarget = Math.min(
    current.option === 'simple' ? currentCents : Infinity,
    bestSimple ?? Infinity,
  );
  const target = Number.isFinite(simpleTarget) ? simpleTarget : currentCents;
  return {
    currentCents,
    results,
    shift: {
      bi: shiftFor(results, 'bi', usage, current, target),
      tri: shiftFor(results, 'tri', usage, current, target),
    },
  };
}
