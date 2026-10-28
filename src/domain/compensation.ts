// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * What the network operator owes for a year of outages over the zone's standard
 * (RQS art. 24.º and 102.º; values in docs/voltage.md, src/data/voltage.json),
 * low voltage up to 41,4 kVA (BTN):
 *
 * - by number: (long outages − standard) × FC;
 * - by duration: (hours of long outages − standard) × contracted kVA × KC;
 * - the higher of the two, at most 200 % of what the year's energy paid in
 *   network-use tariff (the operator's yearly average for BTN).
 *
 * An estimate: FC and KC are the regulation's own values, which ERSE raises with
 * inflation every year; the average network tariff is known for past years only,
 * so a later year uses the latest one.
 */
import data from '../data/voltage.json';
import { divideRounded, type Cents } from '../lib/money';
import type { Wh } from '../lib/units';
import type { YearSummary } from './voltage';

const values = data.compensation;
const NETWORK = Object.entries(values.networkMicroPerKwh)
  .map(([year, micro]) => ({ year: Number(year), micro }))
  .sort((a, b) => a.year - b.year);

/** Below this the operator pays it into the tariffs instead (RQS art. 106.º, n.º 3). */
export const COMPENSATION_MINIMUM_CENTS: Cents = values.minimumCents;

export interface Compensation {
  byCountCents: Cents;
  /** Null without the contracted power. */
  byHoursCents: Cents | null;
  /** The higher, after the cap. */
  cents: Cents;
  /** Null without the year's energy. */
  capCents: Cents | null;
  capped: boolean;
  /** The year of the network tariff used for the cap (the latest known). */
  capYear: number | null;
}

/** The average network-use tariff for a year, or the latest one before it. */
function networkTariff(year: number): { year: number; micro: number } | null {
  return NETWORK.filter((item) => item.year <= year).at(-1) ?? NETWORK.at(-1) ?? null;
}

/** Null when the year is within the standard (or the zone is unknown). */
export function outageCompensation(
  summary: YearSummary,
  powerVa: number | null,
  yearEnergyWh: Wh | null,
): Compensation | null {
  const { standard } = summary;
  if (!standard || (!summary.overCount && !summary.overHours)) return null;
  const extraCount = Math.max(0, summary.longCount - standard.interruptions);
  const byCountCents = extraCount * values.fcCents;
  const extraSeconds = Math.max(0, summary.longSeconds - standard.hours * 3600);
  // s × VA × µ€/kWh = µ€ × 3600 × 1000; cents are 10 000 µ€.
  const byHoursCents =
    powerVa === null
      ? null
      : Number(
          divideRounded(
            BigInt(extraSeconds) * BigInt(powerVa) * BigInt(values.kcMicroPerKwh),
            3600n * 1000n * 10_000n,
          ),
        );
  const higher = Math.max(byCountCents, byHoursCents ?? 0);
  const network = networkTariff(summary.year);
  // Wh × µ€/kWh × % = µ€ × 1000 × 100.
  const capCents =
    yearEnergyWh === null || network === null
      ? null
      : Number(
          divideRounded(
            BigInt(yearEnergyWh) * BigInt(network.micro) * BigInt(values.capPct),
            1000n * 100n * 10_000n,
          ),
        );
  return {
    byCountCents,
    byHoursCents,
    cents: capCents === null ? higher : Math.min(higher, capCents),
    capCents,
    capped: capCents !== null && higher > capCents,
    capYear: capCents === null ? null : (network?.year ?? null),
  };
}
