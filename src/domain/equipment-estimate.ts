// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * "Onde vai o consumo (estimativa)", for a house measured only by the E-Redes
 * (docs/equipment.md): each equipment's energy from its own energy label, or
 * its plate, and the use the user states, set against what was measured.
 * There are no typical values: an equipment without an estimate counts for
 * nothing and is named as missing, and the rest stays unexplained.
 *
 * The label's unit depends on the product (sources in docs/equipment.md):
 * kWh/ano (refrigerating appliances), kWh/100 ciclos (washing machines,
 * dishwashers, tumble dryers), kWh/1000 h (televisions). The plate is a
 * ceiling, so an estimate by the plate is on the high side.
 */
import { z } from 'zod';
import type { Cents } from '../lib/money';
import { addDays } from './consumption';
import { lisbonDate, startOfLisbonDay, type EpochSeconds, type LocalDate } from '../lib/time';
import type { Watts, Wh } from '../lib/units';
import { electricityCost, energyByPeriod } from './electricity-cost';
import type { EquipmentKind } from './equipment';
import type { TariffInput } from './tariff';

export const ESTIMATE_BASES = ['year', 'cycles100', 'hours1000', 'plate'] as const;
export type EstimateBasis = (typeof ESTIMATE_BASES)[number];

/** The label's energy: up to 999,999 kWh (what a kWh field takes). */
const LabelWh = z.number().int().min(1).max(999_999);
const MinutesPerDay = z.number().int().min(1).max(1440);

export const estimateSchema = z.discriminatedUnion('basis', [
  z.strictObject({ basis: z.literal('year'), labelWh: LabelWh }),
  z.strictObject({
    basis: z.literal('cycles100'),
    labelWh: LabelWh,
    cyclesPerWeek: z.number().int().min(1).max(50),
  }),
  z.strictObject({ basis: z.literal('hours1000'), labelWh: LabelWh, minutesPerDay: MinutesPerDay }),
  z.strictObject({ basis: z.literal('plate'), minutesPerDay: MinutesPerDay }),
]);
export type Estimate = z.infer<typeof estimateSchema>;

const DAYS_PER_YEAR = 365;
const HOURS_PER_YEAR = 8760;

/** The energy over `days` days; null by the plate without a plate. */
export function estimateWh(estimate: Estimate, ratedPowerW: Watts | null, days: number): Wh | null {
  switch (estimate.basis) {
    case 'year':
      return Math.round((estimate.labelWh * days) / DAYS_PER_YEAR);
    case 'cycles100':
      return Math.round((estimate.labelWh * estimate.cyclesPerWeek * days) / (100 * 7));
    case 'hours1000':
      return Math.round((estimate.labelWh * estimate.minutesPerDay * days) / (1000 * 60));
    case 'plate':
      return ratedPowerW === null
        ? null
        : Math.round((ratedPowerW * estimate.minutesPerDay * days) / 60);
  }
}

/** A yearly label as the average power it means (a fridge or a freezer); null for the others. */
export function labelAverageW(estimate: Estimate): Watts | null {
  return estimate.basis === 'year' ? Math.round(estimate.labelWh / HOURS_PER_YEAR) : null;
}

export interface EstimatedEquipment {
  id: string;
  name: string;
  kind: EquipmentKind | null;
  ratedPowerW: Watts | null;
  estimate: Estimate | null;
}

/** What is on day and night: a fridge or a freezer (an old washer's label also said kWh/ano). */
const COLD: readonly (EquipmentKind | null)[] = ['fridge', 'freezer'];

/** The fridges' and freezers' yearly labels as one average power, to set against the baseload; null without one. */
export function coldAverage(
  items: readonly EstimatedEquipment[],
): { watts: Watts; names: string[] } | null {
  const cold = items.filter((item) => COLD.includes(item.kind) && item.estimate?.basis === 'year');
  if (cold.length === 0) return null;
  const labelWh = cold.reduce(
    (sum, item) => sum + (item.estimate?.basis === 'year' ? item.estimate.labelWh : 0),
    0,
  );
  return {
    watts: Math.round(labelWh / HOURS_PER_YEAR),
    names: cold.map((item) => item.name).sort((a, b) => a.localeCompare(b, 'pt')),
  };
}

export interface EstimateRow {
  id: string;
  name: string;
  wh: Wh;
  /** At the period's average energy price (energy, IEC and VAT; not the power term); null without a tariff. */
  cents: Cents | null;
  /** Of what was measured, whole percent. */
  pct: number;
}

export interface ConsumptionEstimate {
  rows: EstimateRow[];
  explainedWh: Wh;
  explainedPct: number;
  /** Measured minus estimated: negative when the estimates pass what was measured. */
  restWh: Wh;
  /** Equipment without an estimate that can be worked out, by name. */
  missing: string[];
}

export function consumptionEstimate(
  items: readonly EstimatedEquipment[],
  measured: Measured,
): ConsumptionEstimate {
  const { measuredWh, days, energyCents } = measured;
  const share = (wh: number) => (measuredWh > 0 ? Math.round((wh * 100) / measuredWh) : 0);
  const rows: EstimateRow[] = [];
  const missing: string[] = [];
  for (const item of items) {
    const wh = item.estimate ? estimateWh(item.estimate, item.ratedPowerW, days) : null;
    if (wh === null) {
      missing.push(item.name);
      continue;
    }
    rows.push({
      id: item.id,
      name: item.name,
      wh,
      cents:
        energyCents === null
          ? null
          : measuredWh > 0
            ? Math.round((energyCents * wh) / measuredWh)
            : 0,
      pct: share(wh),
    });
  }
  rows.sort((a, b) => b.wh - a.wh || a.name.localeCompare(b.name, 'pt'));
  const explainedWh = rows.reduce((sum, row) => sum + row.wh, 0);
  return {
    rows,
    explainedWh,
    explainedPct: share(explainedWh),
    restWh: measuredWh - explainedWh,
    missing: missing.sort((a, b) => a.localeCompare(b, 'pt')),
  };
}

/** What the E-Redes measured in the days set against the estimates. */
export interface Measured {
  measuredWh: Wh;
  /** Lisbon days with data. */
  days: number;
  /** The first and last of those days. */
  from: LocalDate;
  to: LocalDate;
  /** The cost of that energy with the household's tariff, without the power term; null without one. */
  energyCents: Cents | null;
}

/** The estimate is set against the last 30 days of data. */
export const RECENT_DAYS = 30;

/** The last RECENT_DAYS Lisbon days of data, up to the last quarter hour; null without data. */
export function recentMeasured(
  quarters: readonly { ts: EpochSeconds; energyWh: Wh }[],
  tariff: TariffInput | null,
): Measured | null {
  const last = quarters.at(-1);
  if (!last) return null;
  const since = startOfLisbonDay(addDays(lisbonDate(last.ts), -(RECENT_DAYS - 1)));
  const recent = quarters.filter((quarter) => quarter.ts >= since);
  const dates = new Set(recent.map((quarter) => lisbonDate(quarter.ts)));
  const days = dates.size;
  const measuredWh = recent.reduce((sum, quarter) => sum + quarter.energyWh, 0);
  const energyCents =
    tariff === null
      ? null
      : electricityCost(energyByPeriod(recent, tariff), days, tariff).totalCents -
        electricityCost({}, days, tariff).totalCents;
  return {
    measuredWh,
    days,
    from: lisbonDate((recent[0] ?? last).ts),
    to: lisbonDate(last.ts),
    energyCents,
  };
}
