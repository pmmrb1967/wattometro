// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Contracted power: would the smart meter have cut the power at a lower tier?
 * Trip curve of the E-Redes smart meter (docs/contracted-power.md,
 * src/data/power-trip.json), single phase:
 *   it may only trip while S > k × Sc; it trips when that has lasted longer than
 *   Tdisp = Q / (S/Sc − k) seconds, recomputed every second.
 * The margin lowers Sc (the tier) by a percentage, to cover meters configured
 * with other parameters and loads not seen yet.
 *
 * Ratios and seconds are not money or energy: plain numbers are fine here.
 */
import powerTiers from '../data/power-tiers.json';
import trip from '../data/power-trip.json';
import type { Cents, MicroEuros } from '../lib/money';
import { eurosToMicro } from '../lib/money';
import {
  decodeSeconds,
  READINGS_1S_BYTES,
  SECONDS_PER_MINUTE,
  type SecondReadings,
} from '../lib/readings-1s';
import type { EpochSeconds } from '../lib/time';
import { electricityCost } from './electricity-cost';
import { powerKey, type CycleCode, type Offer } from './erse';
import type { TariffInput, TariffOption } from './tariff';

export interface TripCurve {
  q: number;
  k: number;
}

export const SINGLE_PHASE: TripCurve = { q: trip.q, k: trip.kSinglePhase };
export const TIERS_VA: readonly number[] = powerTiers.tiersVa;
export const DEFAULT_MARGIN_PCT = 10;

/** Highest one-second power of a period: apparent where known, else active (VA or W). */
export function periodPeak(meter: {
  apparentMaxVa: number | null;
  activeOnlyMaxW: number | null;
}): number {
  return Math.max(meter.apparentMaxVa ?? 0, meter.activeOnlyMaxW ?? 0);
}

/** The limit the simulation uses for a tier: the tier less the margin (VA). */
export function effectiveLimit(tierVa: number, marginPct: number): number {
  return Math.floor((tierVa * (100 - marginPct)) / 100);
}

/** Apparent power above which the meter starts counting (k × limit), VA. */
export function tripThreshold(tierVa: number, marginPct: number, curve: TripCurve): number {
  // Rounded first: 6210 × 1,2 is 7451,999… in floating point.
  return Math.floor(Math.round(effectiveLimit(tierVa, marginPct) * curve.k * 1000) / 1000);
}

/** Seconds above the threshold before the meter trips at `va`; null when it never trips. */
export function tripSeconds(va: number, limitVa: number, curve: TripCurve): number | null {
  const excess = va / limitVa - curve.k;
  return excess > 0 ? curve.q / excess : null;
}

/** A minute above a threshold, as sent by GET /v1/power/peaks. */
export interface PeakMinute {
  ts: EpochSeconds;
  powerMaxW: number;
  apparentMaxVa: number | null;
  seconds: SecondReadings | null;
}

const PEAK_RECORD_BYTES = 4 + 4 + 4 + 1 + READINGS_1S_BYTES;

/** Records of server/src/repo/power.ts (peakMinutes). */
export function decodePeaks(buffer: ArrayBuffer): PeakMinute[] {
  if (buffer.byteLength % PEAK_RECORD_BYTES !== 0) {
    throw new RangeError(`Not whole peak records: ${buffer.byteLength} bytes`);
  }
  const view = new DataView(buffer);
  const minutes: PeakMinute[] = [];
  for (let offset = 0; offset < buffer.byteLength; offset += PEAK_RECORD_BYTES) {
    const apparent = view.getInt32(offset + 8, true);
    minutes.push({
      ts: view.getUint32(offset, true),
      powerMaxW: view.getInt32(offset + 4, true),
      apparentMaxVa: apparent < 0 ? null : apparent,
      seconds:
        view.getUint8(offset + 12) === 1
          ? decodeSeconds(new Uint8Array(buffer, offset + 13, READINGS_1S_BYTES))
          : null,
    });
  }
  return minutes;
}

export interface Sample {
  ts: EpochSeconds;
  /** Apparent power, VA. */
  va: number;
}

/**
 * One apparent power per second. A minute without per-second values counts as
 * its active peak during the whole minute: longer than it lasted (cautious),
 * but active power is at most the apparent one, so it is flagged as estimated.
 */
export function samplesOf(minutes: readonly PeakMinute[]): {
  samples: Sample[];
  estimatedMinutes: number;
} {
  const samples: Sample[] = [];
  let estimatedMinutes = 0;
  for (const minute of [...minutes].sort((a, b) => a.ts - b.ts)) {
    if (!minute.seconds) {
      estimatedMinutes += 1;
      for (let second = 0; second < SECONDS_PER_MINUTE; second++) {
        samples.push({ ts: minute.ts + second, va: Math.abs(minute.powerMaxW) });
      }
      continue;
    }
    const { power, nonActive } = minute.seconds;
    power.forEach((p, second) => {
      if (p === null) return;
      const q = nonActive[second] ?? null;
      samples.push({
        ts: minute.ts + second,
        va: q === null ? Math.abs(p) : Math.round(Math.hypot(p, q)),
      });
    });
  }
  return { samples, estimatedMinutes };
}

export interface TierSimulation {
  tierVa: number;
  limitVa: number;
  /** When the meter would have cut the power, and the power at that second. */
  trips: Sample[];
  /** Nearest approach to a trip without one: share of Tdisp reached (0–100). */
  closest: (Sample & { progressPct: number }) | null;
}

/** Runs the trip curve over consecutive seconds; a missing second resets the counter. */
export function simulateTier(
  samples: readonly Sample[],
  tierVa: number,
  marginPct: number,
  curve: TripCurve,
): TierSimulation {
  const limitVa = effectiveLimit(tierVa, marginPct);
  const trips: Sample[] = [];
  let closest: TierSimulation['closest'] = null;
  let above = 0;
  let previous: EpochSeconds | null = null;
  for (const sample of samples) {
    if (previous === null || sample.ts !== previous + 1) above = 0;
    previous = sample.ts;
    const limit = tripSeconds(sample.va, limitVa, curve);
    if (limit === null) {
      above = 0;
      continue;
    }
    above += 1;
    if (above > limit) {
      trips.push(sample);
      above = 0;
      continue;
    }
    const progressPct = Math.round((above * 100) / limit);
    if (!closest || progressPct > closest.progressPct) closest = { ...sample, progressPct };
  }
  return { tierVa, limitVa, trips, closest };
}

/** A run of seconds above k × the contracted power: the meter was counting. */
export interface NearTripEpisode {
  /** First second above the threshold. */
  start: EpochSeconds;
  /** Consecutive seconds above it (in the data: after a trip the power stays on). */
  seconds: number;
  peakVa: number;
  /** Highest share of Tdisp reached (0–100); 100 when the meter would have cut. */
  progressPct: number;
  tripped: boolean;
}

/**
 * Every time the meter would have started counting at the contracted power
 * (no margin: the real contract), with how close it came to cutting. Same
 * counting as simulateTier: a second below the threshold or a missing second
 * ends the episode. A trip does not: the power the data shows afterwards is
 * the same overload, not a second one.
 */
export function nearTripEpisodes(
  samples: readonly Sample[],
  tierVa: number,
  curve: TripCurve,
): NearTripEpisode[] {
  const episodes: NearTripEpisode[] = [];
  let current: NearTripEpisode | null = null;
  let previous: EpochSeconds | null = null;
  for (const sample of samples) {
    if (previous === null || sample.ts !== previous + 1) current = null;
    previous = sample.ts;
    const limit = tripSeconds(sample.va, tierVa, curve);
    if (limit === null) {
      current = null;
      continue;
    }
    if (!current) {
      current = { start: sample.ts, seconds: 0, peakVa: 0, progressPct: 0, tripped: false };
      episodes.push(current);
    }
    current.seconds += 1;
    current.peakVa = Math.max(current.peakVa, sample.va);
    if (current.tripped) continue;
    if (current.seconds > limit) {
      current.progressPct = 100;
      current.tripped = true;
      continue;
    }
    current.progressPct = Math.max(
      current.progressPct,
      Math.round((current.seconds * 100) / limit),
    );
  }
  return episodes;
}

export type TierStatus =
  /** The peak never reached the threshold: it cannot trip. */
  | 'clear'
  /** Above the threshold at times, but never long enough. */
  | 'safe'
  | 'trips'
  /** Too many minutes above the threshold to check. */
  | 'unknown';

export interface TierEvaluation {
  tierVa: number;
  status: TierStatus;
  simulation: TierSimulation | null;
  estimatedMinutes: number;
}

export interface Recommendation {
  /** Lowest tier that never trips; null when even the highest would. */
  recommendedVa: number | null;
  /** From the recommended tier (or the first that cannot be checked) downwards. */
  evaluations: TierEvaluation[];
}

/**
 * Lowest tier that would not have tripped: tiers whose threshold is above the
 * highest peak are clear; lower ones are simulated, one by one downwards, with
 * the minutes above their threshold, until one trips or cannot be checked.
 */
export async function recommendTier(input: {
  /** Highest one-second power of the period (VA, or W where only active is known). */
  peak: number;
  marginPct: number;
  curve: TripCurve;
  tiersVa?: readonly number[];
  fetchPeaks: (threshold: number) => Promise<{ minutes: PeakMinute[]; truncated: boolean }>;
}): Promise<Recommendation> {
  const tiers = [...(input.tiersVa ?? TIERS_VA)].sort((a, b) => a - b);
  const clearIndex = tiers.findIndex(
    (tier) => tripThreshold(tier, input.marginPct, input.curve) >= input.peak,
  );
  if (clearIndex < 0) return { recommendedVa: null, evaluations: [] };
  const clearVa = tiers[clearIndex] as number;
  const evaluations: TierEvaluation[] = [
    { tierVa: clearVa, status: 'clear', simulation: null, estimatedMinutes: 0 },
  ];
  let recommendedVa = clearVa;
  for (let index = clearIndex - 1; index >= 0; index--) {
    const tierVa = tiers[index] as number;
    const { minutes, truncated } = await input.fetchPeaks(
      tripThreshold(tierVa, input.marginPct, input.curve),
    );
    if (truncated) {
      evaluations.push({ tierVa, status: 'unknown', simulation: null, estimatedMinutes: 0 });
      break;
    }
    const { samples, estimatedMinutes } = samplesOf(minutes);
    const simulation = simulateTier(samples, tierVa, input.marginPct, input.curve);
    const status = simulation.trips.length > 0 ? 'trips' : 'safe';
    evaluations.push({ tierVa, status, simulation, estimatedMinutes });
    if (status === 'trips') break;
    recommendedVa = tierVa;
  }
  return { recommendedVa, evaluations };
}

const CYCLE_CODES: Record<TariffOption, CycleCode> = { simple: '1', bi: '2', tri: '3' };

/**
 * The fixed term at another tier, from an ERSE offer whose fixed term at the
 * current tier equals the contract's (same 4 decimals); offers of the
 * contract's supplier first. Null when no offer matches.
 */
export function offerFixedPerDay(
  offers: readonly Offer[],
  tariff: TariffInput,
  targetVa: number,
): { fixedPerDay: MicroEuros; offer: Offer } | null {
  const cycle = CYCLE_CODES[tariff.option];
  const supplier = tariff.supplier?.trim().toLowerCase() ?? '';
  const matches = offers.filter((offer) => {
    const current = offer.prices[powerKey(tariff.powerVa)]?.[cycle]?.fixedPerDay;
    const target = offer.prices[powerKey(targetVa)]?.[cycle]?.fixedPerDay;
    return (
      current !== undefined && target !== undefined && eurosToMicro(current) === tariff.fixedPerDay
    );
  });
  const bySupplier = (offer: Offer) =>
    supplier !== '' &&
    (offer.supplier.toLowerCase().includes(supplier) ||
      supplier.includes(offer.supplier.toLowerCase()));
  const offer = matches.find(bySupplier) ?? matches[0];
  const target = offer?.prices[powerKey(targetVa)]?.[cycle]?.fixedPerDay;
  return offer && target !== undefined ? { fixedPerDay: eurosToMicro(target), offer } : null;
}

/** Fixed term of a year (365 days) with VAT, at a tier and price. */
export function annualFixedCents(
  tariff: TariffInput,
  powerVa: number,
  fixedPerDay: MicroEuros,
): Cents {
  return electricityCost({}, 365, { ...tariff, powerVa, fixedPerDay }).powerCents;
}
