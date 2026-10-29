// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Solar panels on this house's real year (docs/pvgis.md): PVGIS's hourly
 * production for 1 kWp (a real year, UTC hours) scaled to the panels, spread
 * evenly over each hour's quarters and set against the house's quarter hours
 * of the last 365 days, matched by UTC day and hour (29 February uses the
 * 28th). What the house would use as it is produced comes off the bill; the
 * rest is surplus, worth only the price the user gives for it.
 */
import { z } from 'zod';
import { energyValueCents, type Cents, type MicroEuros } from '../lib/money';
import type { EpochSeconds } from '../lib/time';
import { hourWh, type Wh } from '../lib/units';
import {
  annualUsage,
  compareOffers,
  energyFor,
  YEAR_DAYS,
  type AnnualUsage,
  type OfferResult,
} from './compare';
import { electricityCost } from './electricity-cost';
import type { Offer } from './erse';
import type { PeriodsMap, TariffInput } from './tariff';

/** One kWp's production by UTC "MMDDHH", Wh. */
export type SolarYear = ReadonlyMap<string, Wh>;

const PvgisSeries = z.object({
  outputs: z.object({
    hourly: z
      .array(z.object({ time: z.string().regex(/^\d{8}:\d{4}$/), P: z.number().finite() }))
      .min(8760)
      .max(8784),
  }),
});

/** GET /v1/solar's body (PVGIS seriescalc JSON), or null when it is not one. */
export function parsePvgis(json: unknown): SolarYear | null {
  const parsed = PvgisSeries.safeParse(json);
  if (!parsed.success) return null;
  const year = new Map<string, Wh>();
  for (const { time, P } of parsed.data.outputs.hourly) {
    // "20230101:1210" → "010112": month, day, UTC hour.
    year.set(time.slice(4, 8) + time.slice(9, 11), hourWh(P));
  }
  return year;
}

function hourKey(ts: EpochSeconds): string {
  const date = new Date(ts * 1000);
  const month = date.getUTCMonth() + 1;
  const day = month === 2 && date.getUTCDate() === 29 ? 28 : date.getUTCDate();
  const pad = (value: number) => String(value).padStart(2, '0');
  return pad(month) + pad(day) + pad(date.getUTCHours());
}

export interface SolarEffect {
  /** A year of production, use as produced and surplus (scaled like annualUsage). */
  productionWh: Wh;
  selfWh: Wh;
  surplusWh: Wh;
  /** The year still bought from the grid. */
  usage: AnnualUsage;
}

/**
 * The panels (tenths of a kWp) against the quarter hours; null with too few
 * quarters for a year (annualUsage).
 */
export function solarEffect(
  quarters: readonly { ts: EpochSeconds; energyWh: Wh }[],
  year: SolarYear,
  tenthsKwp: number,
  map: PeriodsMap,
): SolarEffect | null {
  let production = 0;
  let self = 0;
  const remaining = quarters.map(({ ts, energyWh }) => {
    // A quarter of the hour's Wh for 1 kWp, times kWp (tenths / 10).
    const produced = Math.round(((year.get(hourKey(ts)) ?? 0) * tenthsKwp) / 40);
    const used = Math.min(Math.max(energyWh, 0), produced);
    production += produced;
    self += used;
    return { ts, energyWh: energyWh - used };
  });
  const usage = annualUsage(remaining, map);
  if (!usage) return null;
  const scale = (wh: Wh) => Math.round((wh * YEAR_DAYS * 96) / quarters.length);
  return {
    productionWh: scale(production),
    selfWh: scale(self),
    surplusWh: scale(production - self),
    usage,
  };
}

export interface SolarSaving extends SolarEffect {
  /** A year's bill less with the current tariff. */
  savingCents: Cents;
  /** The surplus at the user's price; null without one. */
  surplusCents: Cents | null;
  /** Years for the installation to pay for itself; null without its cost or a gain. */
  paybackYears: number | null;
  /** The cheapest offer with the panels, and the current tariff's year with them. */
  best: OfferResult | null;
  currentWithSolarCents: Cents;
}

export function solarSaving(input: {
  quarters: readonly { ts: EpochSeconds; energyWh: Wh }[];
  year: SolarYear;
  tenthsKwp: number;
  current: TariffInput;
  offers: readonly Offer[];
  today: string;
  /** What a kWh of surplus is sold for, µ€; null when unknown. */
  surplusMicro: MicroEuros | null;
  /** What the installation costs; null when unknown. */
  installCents: Cents | null;
}): SolarSaving | null {
  const { quarters, current } = input;
  const before = annualUsage(quarters, current.periodsMap);
  const effect = solarEffect(quarters, input.year, input.tenthsKwp, current.periodsMap);
  if (!before || !effect) return null;
  const yearCents = (usage: AnnualUsage) =>
    electricityCost(energyFor(current.option, current.cycle, usage), YEAR_DAYS, current).totalCents;
  const currentWithSolarCents = yearCents(effect.usage);
  const savingCents = yearCents(before) - currentWithSolarCents;
  const surplusCents =
    input.surplusMicro === null ? null : energyValueCents(effect.surplusWh, input.surplusMicro);
  const gain = savingCents + (surplusCents ?? 0);
  const paybackYears =
    input.installCents !== null && input.installCents > 0 && gain > 0
      ? Math.round((input.installCents * 10) / gain) / 10
      : null;
  const comparison = compareOffers({
    usage: effect.usage,
    current,
    offers: input.offers,
    today: input.today,
  });
  return {
    ...effect,
    savingCents,
    surplusCents,
    paybackYears,
    best: comparison.results[0] ?? null,
    currentWithSolarCents,
  };
}
