// SPDX-License-Identifier: AGPL-3.0-or-later
// Adapted from Faturómetro (src/domain/electricity-cost.ts): integer units, energy by quarter hour.
/**
 * Cost of electricity over whole days, with the household's own contract:
 *   fixed term × days + Σ Wh × price + IEC + CAV + DGEG fee + VAT
 * VAT rules: docs/electricity-vat.md (src/data/electricity-vat.json).
 *
 * Exact integer arithmetic: Wh × µ€/kWh gives nano-euros (BigInt), and each
 * component (energy, power, taxes) is rounded to cents once, at the end.
 * An estimate, not an invoice: the CAV and DGEG fee are spread evenly over the
 * year (× 12 / 365) and the ≤ 3,45 kVA access-tariff VAT detail is ignored.
 */
import vat from '../data/electricity-vat.json';
import { nanoToCents, type Cents } from '../lib/money';
import type { EpochSeconds } from '../lib/time';
import type { Wh } from '../lib/units';
import type { BillingPeriod, TariffInput } from './tariff';
import { billingPeriod } from './time-cycles';

export type EnergyByPeriod = Partial<Record<BillingPeriod, Wh>>;

export interface Cost {
  /** Energy with its VAT. */
  energyCents: Cents;
  /** Fixed (power) term with its VAT. */
  powerCents: Cents;
  /** IEC, CAV and DGEG fee, with their VAT. */
  taxesCents: Cents;
  totalCents: Cents;
  /** Energy taxed at the reduced VAT rate. */
  reducedWh: Wh;
}

const NANO_PER_MICRO = 1000n;
const PCT = 100n;

/** Energy (Wh) taxed at the reduced rate over `days` days: 200 kWh per 30 days, up to 6,9 kVA. */
export function reducedVatWh(totalWh: Wh, days: number, tariff: TariffInput): Wh {
  if (tariff.powerVa > vat.reducedEnergyMaxPowerVa || totalWh <= 0) return 0;
  const kwhPer30Days = tariff.largeFamily
    ? vat.reducedKwhPer30DaysLargeFamily
    : vat.reducedKwhPer30Days;
  return Math.min(totalWh, Math.round((days * kwhPer30Days * 1000) / 30));
}

/** Energy of each quarter hour (start, Wh) added up by the tariff's billing period. */
export function energyByPeriod(
  quarters: readonly { ts: EpochSeconds; energyWh: Wh }[],
  tariff: TariffInput,
): EnergyByPeriod {
  const totals: EnergyByPeriod = {};
  for (const { ts, energyWh } of quarters) {
    const period = billingPeriod(ts, tariff.option, tariff.cycle, tariff.periodsMap);
    totals[period] = (totals[period] ?? 0) + energyWh;
  }
  return totals;
}

const withVat = (net: bigint, pct: number) => (net * (PCT + BigInt(pct))) / PCT;

export function electricityCost(energy: EnergyByPeriod, days: number, tariff: TariffInput): Cost {
  if (!Number.isInteger(days) || days < 0) throw new RangeError(`Not whole days: ${days}`);
  let totalWh = 0;
  let energyNano = 0n;
  for (const [period, wh] of Object.entries(energy) as [BillingPeriod, Wh][]) {
    if (!Number.isInteger(wh) || wh < 0) throw new TypeError(`Not Wh: ${wh}`);
    const price = tariff.energy[period];
    if (price === undefined) {
      if (wh > 0) throw new Error(`No price for ${period}`);
      continue;
    }
    totalWh += wh;
    energyNano += BigInt(wh) * BigInt(price);
  }
  const iecNano = BigInt(totalWh) * BigInt(tariff.iecPerKwh);

  // Energy and IEC: reduced rate on the first kWh, normal rate on the rest (by energy share).
  const reducedWh = reducedVatWh(totalWh, days, tariff);
  const blended = (net: bigint) =>
    totalWh === 0
      ? net
      : net +
        (net *
          (BigInt(reducedWh) * BigInt(vat.reducedPct) +
            BigInt(totalWh - reducedWh) * BigInt(vat.normalPct))) /
          (BigInt(totalWh) * PCT);

  const day = BigInt(days);
  const fixedNano = day * BigInt(tariff.fixedPerDay) * NANO_PER_MICRO;
  const perDay = (perMonth: number) => (day * BigInt(perMonth) * 12n * NANO_PER_MICRO) / 365n;

  const energyCents = nanoToCents(blended(energyNano));
  const powerCents = nanoToCents(withVat(fixedNano, vat.normalPct));
  const taxesCents = nanoToCents(
    blended(iecNano) +
      withVat(perDay(tariff.cavPerMonth), vat.reducedPct) +
      withVat(perDay(tariff.dgegPerMonth), vat.normalPct),
  );
  return {
    energyCents,
    powerCents,
    taxesCents,
    totalCents: energyCents + powerCents + taxesCents,
    reducedWh,
  };
}
