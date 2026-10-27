// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * What an appliance cost on a day (Phase 8.4): the cost of the day's energy
 * minus the cost of the day without the appliance, with the household's
 * tariff (energy, IEC and VAT; the power term is paid either way), as for the
 * baseload and the unusual days. The appliance's energy is spread over the
 * quarter hours its uses covered, in proportion to their seconds in each, so a
 * dishwasher at night is priced at the empty-period price and one at dinner at
 * the peak price (with a bi- or tri-hourly option).
 *
 * shiftSavingCents: what the day would have cost less with all of it in the
 * cheapest period of the tariff (nothing with a simple tariff, where the hour
 * does not change the price).
 */
import type { Cents } from '../lib/money';
import { floorTo, QUARTER_HOUR, type EpochSeconds } from '../lib/time';
import type { Wh } from '../lib/units';
import { electricityCost, energyByPeriod, type EnergyByPeriod } from './electricity-cost';
import type { BillingPeriod, TariffInput } from './tariff';

export interface Span {
  start: EpochSeconds;
  end: EpochSeconds;
}

/** Seconds of the spans in each quarter hour (by its start), each second counted once. */
function secondsByQuarter(spans: readonly Span[]): Map<EpochSeconds, number> {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const seconds = new Map<EpochSeconds, number>();
  let covered = -Infinity;
  for (const span of sorted) {
    let from = Math.max(span.start, covered);
    while (from < span.end) {
      const quarter = floorTo(from, QUARTER_HOUR);
      const to = Math.min(span.end, quarter + QUARTER_HOUR);
      seconds.set(quarter, (seconds.get(quarter) ?? 0) + (to - from));
      from = to;
    }
    covered = Math.max(covered, span.end);
  }
  return seconds;
}

/**
 * `energyWh` spread over the quarter hours the spans cover, in proportion to
 * their seconds in each; whole Wh that add up to `energyWh` exactly.
 */
export function spreadOverQuarters(
  energyWh: Wh,
  spans: readonly Span[],
): { ts: EpochSeconds; energyWh: Wh }[] {
  const seconds = [...secondsByQuarter(spans)].sort(([a], [b]) => a - b);
  const total = seconds.reduce((sum, [, count]) => sum + count, 0);
  if (total === 0) return [];
  const quarters: { ts: EpochSeconds; energyWh: Wh }[] = [];
  let elapsed = 0;
  let given = 0;
  for (const [ts, count] of seconds) {
    elapsed += count;
    // Cumulative rounding: the parts add up to the whole.
    const upTo = Math.round((energyWh * elapsed) / total);
    quarters.push({ ts, energyWh: upTo - given });
    given = upTo;
  }
  return quarters;
}

const without = (all: EnergyByPeriod, own: EnergyByPeriod): EnergyByPeriod => {
  const rest: EnergyByPeriod = {};
  for (const [period, wh] of Object.entries(all) as [BillingPeriod, Wh][]) {
    // Never below zero: the day's energy may miss seconds the appliance's has.
    rest[period] = Math.max(0, wh - (own[period] ?? 0));
  }
  return rest;
};

/** The period with the lowest energy price; null for a simple tariff. */
export function cheapestPeriod(tariff: TariffInput): BillingPeriod | null {
  if (tariff.option === 'simple') return null;
  const prices = Object.entries(tariff.energy) as [BillingPeriod, number][];
  return prices.reduce((best, entry) => (entry[1] < best[1] ? entry : best))[0];
}

/** What the day would have cost less with the appliance's energy all in the cheapest period. */
export function shiftSavingCents(
  appliance: readonly { ts: EpochSeconds; energyWh: Wh }[],
  day: readonly { ts: EpochSeconds; energyWh: Wh }[],
  tariff: TariffInput,
): Cents {
  const cheapest = cheapestPeriod(tariff);
  if (cheapest === null) return 0;
  const all = energyByPeriod(day, tariff);
  const own = energyByPeriod(appliance, tariff);
  const rest = without(all, own);
  const ownWh = Object.values(own).reduce((sum: number, wh) => sum + (wh ?? 0), 0);
  const moved = { ...rest, [cheapest]: (rest[cheapest] ?? 0) + ownWh };
  return Math.max(
    0,
    electricityCost(all, 1, tariff).totalCents - electricityCost(moved, 1, tariff).totalCents,
  );
}

/**
 * The appliance's cost on a day: the day's quarter hours (its whole energy)
 * with and without the appliance's.
 */
export function applianceCostCents(
  appliance: readonly { ts: EpochSeconds; energyWh: Wh }[],
  day: readonly { ts: EpochSeconds; energyWh: Wh }[],
  tariff: TariffInput,
): Cents {
  const all = energyByPeriod(day, tariff);
  const rest = without(all, energyByPeriod(appliance, tariff));
  return Math.max(
    0,
    electricityCost(all, 1, tariff).totalCents - electricityCost(rest, 1, tariff).totalCents,
  );
}
