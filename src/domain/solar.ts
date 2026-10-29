// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Solar panels on this house's real year (docs/pvgis.md): PVGIS's hourly
 * production for 1 kWp (a real year, UTC hours) scaled to the panels, spread
 * evenly over each hour's quarters and set against the house's quarter hours
 * of the last 365 days, matched by UTC day and hour (29 February uses the
 * 28th). What the house would use as it is produced comes off the bill; the
 * rest is surplus, worth only the price the user gives for it. A battery, as
 * the user describes it, keeps surplus for the quarters the panels fall short.
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

/** A home battery as the user describes it; nothing about it is assumed. */
export interface Battery {
  /** Usable capacity, tenths of a kWh. */
  tenthsKwh: number;
  /** Round trip efficiency, % (1–100): what comes back out of each 100 Wh put in. */
  efficiencyPct: number;
  /** The most it charges or discharges at, tenths of a kW; null when not limited. */
  tenthsKw: number | null;
}

export interface SolarEffect {
  /**
   * A year of production, use (as produced or from the battery) and surplus
   * (scaled like annualUsage).
   */
  productionWh: Wh;
  selfWh: Wh;
  surplusWh: Wh;
  /** What the battery gave back to the house; 0 without one. */
  batteryWh: Wh;
  /** The year still bought from the grid. */
  usage: AnnualUsage;
}

/**
 * The panels (tenths of a kWp), and a battery if any, against the quarter
 * hours; null with too few quarters for a year (annualUsage). The battery
 * starts empty, charges only from surplus (never from the grid) and loses its
 * whole round trip on the way in.
 */
export function solarEffect(
  quarters: readonly { ts: EpochSeconds; energyWh: Wh }[],
  year: SolarYear,
  tenthsKwp: number,
  map: PeriodsMap,
  battery: Battery | null = null,
): SolarEffect | null {
  const capacityWh = battery ? battery.tenthsKwh * 100 : 0;
  // Tenths of a kW held for a quarter hour: × 100 W ÷ 4.
  const stepWh = battery?.tenthsKw != null ? battery.tenthsKw * 25 : Infinity;
  let stored = 0;
  let production = 0;
  let self = 0;
  let surplus = 0;
  let fromBattery = 0;
  const ordered = [...quarters].sort((a, b) => a.ts - b.ts);
  const remaining = ordered.map(({ ts, energyWh }) => {
    // A quarter of the hour's Wh for 1 kWp, times kWp (tenths / 10).
    const produced = Math.round(((year.get(hourKey(ts)) ?? 0) * tenthsKwp) / 40);
    const load = Math.max(energyWh, 0);
    const direct = Math.min(load, produced);
    let charged = 0;
    let discharged = 0;
    if (battery) {
      const room = Math.floor(((capacityWh - stored) * 100) / battery.efficiencyPct);
      charged = Math.min(produced - direct, stepWh, room);
      stored += Math.floor((charged * battery.efficiencyPct) / 100);
      discharged = Math.min(load - direct, stepWh, stored);
      stored -= discharged;
    }
    production += produced;
    self += direct + discharged;
    surplus += produced - direct - charged;
    fromBattery += discharged;
    return { ts, energyWh: energyWh - direct - discharged };
  });
  const usage = annualUsage(remaining, map);
  if (!usage) return null;
  const scale = (wh: Wh) => Math.round((wh * YEAR_DAYS * 96) / quarters.length);
  return {
    productionWh: scale(production),
    selfWh: scale(self),
    surplusWh: scale(surplus),
    batteryWh: scale(fromBattery),
    usage,
  };
}

/** Years for a cost to be paid back by a year's gain, one decimal; null without either. */
function payback(costCents: Cents | null, gainCents: Cents): number | null {
  return costCents !== null && costCents > 0 && gainCents > 0
    ? Math.round((costCents * 10) / gainCents) / 10
    : null;
}

/** What the battery adds to the panels alone. */
export interface BatterySaving {
  selfWh: Wh;
  surplusWh: Wh;
  batteryWh: Wh;
  /** A year's bill less than with the panels alone. */
  savingCents: Cents;
  /** The surplus left, at the user's price; null without one. */
  surplusCents: Cents | null;
  /** Years for the battery to pay for itself; null without its cost or a gain. */
  paybackYears: number | null;
}

export interface SolarSaving extends SolarEffect {
  /** A year's bill less with the current tariff. */
  savingCents: Cents;
  /** The surplus at the user's price; null without one. */
  surplusCents: Cents | null;
  /** Years for the installation to pay for itself; null without its cost or a gain. */
  paybackYears: number | null;
  /** With the battery, when there is one; the fields above are the panels alone. */
  battery: BatterySaving | null;
  /** The cheapest offer, and the current tariff's year, with the panels (and the battery). */
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
  battery?: Battery | null;
  /** What the battery costs; null when unknown. */
  batteryCents?: Cents | null;
}): SolarSaving | null {
  const { quarters, current } = input;
  const before = annualUsage(quarters, current.periodsMap);
  const effect = solarEffect(quarters, input.year, input.tenthsKwp, current.periodsMap);
  if (!before || !effect) return null;
  const yearCents = (usage: AnnualUsage) =>
    electricityCost(energyFor(current.option, current.cycle, usage), YEAR_DAYS, current).totalCents;
  const surplusValue = (wh: Wh) =>
    input.surplusMicro === null ? null : energyValueCents(wh, input.surplusMicro);
  const panelsCents = yearCents(effect.usage);
  const savingCents = yearCents(before) - panelsCents;
  const surplusCents = surplusValue(effect.surplusWh);
  const paybackYears = payback(input.installCents, savingCents + (surplusCents ?? 0));

  const stored = input.battery
    ? solarEffect(quarters, input.year, input.tenthsKwp, current.periodsMap, input.battery)
    : null;
  let battery: BatterySaving | null = null;
  if (stored) {
    const batterySaving = panelsCents - yearCents(stored.usage);
    const batterySurplus = surplusValue(stored.surplusWh);
    // Surplus kept in the battery is no longer sold.
    const lostSale =
      surplusCents === null || batterySurplus === null ? 0 : surplusCents - batterySurplus;
    battery = {
      selfWh: stored.selfWh,
      surplusWh: stored.surplusWh,
      batteryWh: stored.batteryWh,
      savingCents: batterySaving,
      surplusCents: batterySurplus,
      paybackYears: payback(input.batteryCents ?? null, batterySaving - lostSale),
    };
  }
  const finalUsage = stored?.usage ?? effect.usage;
  const comparison = compareOffers({
    usage: finalUsage,
    current,
    offers: input.offers,
    today: input.today,
  });
  return {
    ...effect,
    savingCents,
    surplusCents,
    paybackYears,
    battery,
    best: comparison.results[0] ?? null,
    currentWithSolarCents: stored ? yearCents(stored.usage) : panelsCents,
  };
}
