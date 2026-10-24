// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  annualFixedCents,
  decodePeaks,
  effectiveLimit,
  nearTripEpisodes,
  offerFixedPerDay,
  recommendTier,
  samplesOf,
  simulateTier,
  SINGLE_PHASE,
  tripSeconds,
  tripThreshold,
  type PeakMinute,
  type Sample,
} from './contracted-power';
import type { Offer } from './erse';
import type { TariffInput } from './tariff';
import { encodeSeconds } from '../lib/readings-1s';

const T0 = 1_792_000_000;
const run = (va: number, seconds: number, start = T0): Sample[] =>
  Array.from({ length: seconds }, (_, i) => ({ ts: start + i, va }));

describe('trip curve (DEF-C44-506/N, Anexo B1, single phase)', () => {
  it('never trips up to 1,2 × the limit; 62,5 s at 2 ×; 166,7 s at 1,5 ×', () => {
    expect(tripSeconds(8280, 6900, SINGLE_PHASE)).toBeNull();
    expect(tripSeconds(13_800, 6900, SINGLE_PHASE)).toBe(62.5);
    expect(tripSeconds(10_350, 6900, SINGLE_PHASE)).toBeCloseTo(166.67, 2);
  });

  it('applies the margin to the tier', () => {
    expect(effectiveLimit(6900, 10)).toBe(6210);
    // 6210 × 1,2 = 7452 exactly, not 7451.
    expect(tripThreshold(6900, 10, SINGLE_PHASE)).toBe(7452);
    expect(tripThreshold(6900, 0, SINGLE_PHASE)).toBe(8280);
  });
});

describe('simulateTier', () => {
  it('trips after Tdisp consecutive seconds above the threshold', () => {
    // 2 × 6,9 kVA: Tdisp 62,5 s → trips on the 63rd second.
    const tripped = simulateTier(run(13_800, 63), 6900, 0, SINGLE_PHASE);
    expect(tripped.trips).toEqual([{ ts: T0 + 62, va: 13_800 }]);
    const held = simulateTier(run(13_800, 62), 6900, 0, SINGLE_PHASE);
    expect(held.trips).toEqual([]);
    expect(held.closest).toEqual({ ts: T0 + 61, va: 13_800, progressPct: 99 });
  });

  it('restarts the count below the threshold or after a missing second', () => {
    const dip = [...run(13_800, 40), { ts: T0 + 40, va: 8000 }, ...run(13_800, 40, T0 + 41)];
    expect(simulateTier(dip, 6900, 0, SINGLE_PHASE).trips).toEqual([]);
    const gap = [...run(13_800, 40), ...run(13_800, 40, T0 + 41)];
    expect(simulateTier(gap, 6900, 0, SINGLE_PHASE).trips).toEqual([]);
  });

  it('a margin makes a lower load trip', () => {
    // Limit 6210: 10 350 VA is 1,667 × → Tdisp 107 s.
    expect(simulateTier(run(10_350, 108), 6900, 10, SINGLE_PHASE).trips).toHaveLength(1);
    expect(simulateTier(run(10_350, 108), 6900, 0, SINGLE_PHASE).trips).toHaveLength(0);
  });
});

describe('nearTripEpisodes', () => {
  it('reports each run above 1,2 × the contract with how close it came to a trip', () => {
    // 6,9 kVA: counts above 8280 VA. 10 s at 10 350 VA (1,5 ×, Tdisp 166,7 s) = 6 %;
    // then 20 s at 13 800 VA (2 ×, Tdisp 62,5 s) = 32 %, peaking at 13 800.
    const samples = [
      ...run(5000, 5),
      ...run(10_350, 10, T0 + 5),
      ...run(8280, 3, T0 + 15), // at the threshold: not counting
      ...run(13_800, 20, T0 + 18),
    ];
    expect(nearTripEpisodes(samples, 6900, SINGLE_PHASE)).toEqual([
      { start: T0 + 5, seconds: 10, peakVa: 10_350, progressPct: 6, tripped: false },
      { start: T0 + 18, seconds: 20, peakVa: 13_800, progressPct: 32, tripped: false },
    ]);
  });

  it('a long overload is one episode, tripped, however long it lasts', () => {
    // Tdisp 62,5 s at 2 ×: trips on the 63rd second; the data goes on for 200 s.
    expect(nearTripEpisodes(run(13_800, 200), 6900, SINGLE_PHASE)).toEqual([
      { start: T0, seconds: 200, peakVa: 13_800, progressPct: 100, tripped: true },
    ]);
  });

  it('a missing second starts a new episode', () => {
    const gap = [...run(13_800, 40), ...run(13_800, 40, T0 + 41)];
    // 40 / 62,5 = 64 % each.
    expect(nearTripEpisodes(gap, 6900, SINGLE_PHASE).map((e) => e.progressPct)).toEqual([64, 64]);
  });
});

const constant = (p: number, q: number) =>
  encodeSeconds({
    power: Array.from({ length: 60 }, () => p),
    nonActive: Array.from({ length: 60 }, (_, s) => (s === 5 ? null : q)),
    voltage: Array.from({ length: 60 }, () => 2300),
  });

describe('peak records', () => {
  it('decodes the server records and turns them into seconds of apparent power', () => {
    const record = (ts: number, pmax: number, apparent: number, seconds: Uint8Array | null) => {
      const bytes = new Uint8Array(13 + 361);
      const view = new DataView(bytes.buffer);
      view.setUint32(0, ts, true);
      view.setInt32(4, pmax, true);
      view.setInt32(8, apparent, true);
      if (seconds) {
        view.setUint8(12, 1);
        bytes.set(seconds, 13);
      }
      return bytes;
    };
    const buffer = new Uint8Array([
      ...record(T0, 3000, 5000, constant(3000, 4000)),
      ...record(T0 + 60, 7000, -1, null),
    ]).buffer;
    const minutes = decodePeaks(buffer);
    expect(minutes.map((m) => [m.ts, m.powerMaxW, m.apparentMaxVa, m.seconds === null])).toEqual([
      [T0, 3000, 5000, false],
      [T0 + 60, 7000, null, true],
    ]);
    const { samples, estimatedMinutes } = samplesOf(minutes);
    expect(estimatedMinutes).toBe(1);
    expect(samples).toHaveLength(120);
    // sqrt(3000² + 4000²) = 5000; without Q (second 5) the active power.
    expect(samples[0]).toEqual({ ts: T0, va: 5000 });
    expect(samples[5]).toEqual({ ts: T0 + 5, va: 3000 });
    expect(samples[60]).toEqual({ ts: T0 + 60, va: 7000 });
  });
});

describe('recommendTier', () => {
  const minute = (ts: number, va: number): PeakMinute => ({
    ts,
    powerMaxW: va,
    apparentMaxVa: va,
    seconds: null,
  });
  // A 9 kVA load for 3 minutes, without per-second values (the whole minute at the peak).
  const load = [minute(T0, 9000), minute(T0 + 60, 9000), minute(T0 + 120, 9000)];
  const fetchPeaks = async (threshold: number) => ({
    minutes: load.filter((m) => (m.apparentMaxVa ?? 0) > threshold),
    truncated: false,
  });

  it('goes down from the first clear tier until one trips', async () => {
    const result = await recommendTier({
      peak: 9000,
      marginPct: 0,
      curve: SINGLE_PHASE,
      fetchPeaks,
    });
    // 6,9 kVA: threshold 8280 < 9000 → simulated: 9000/6900 = 1,304 × → Tdisp 479 s > 180 s: safe.
    // 5,75 kVA: 1,565 × → Tdisp 136,9 s: trips on the 137th second.
    expect(result.recommendedVa).toBe(6900);
    expect(result.evaluations.map((e) => [e.tierVa, e.status])).toEqual([
      [10_350, 'clear'],
      [6900, 'safe'],
      [5750, 'trips'],
    ]);
    expect(result.evaluations[2]?.simulation?.trips[0]?.ts).toBe(T0 + 136);
  });

  it('stops when there are too many minutes to check', async () => {
    const result = await recommendTier({
      peak: 9000,
      marginPct: 0,
      curve: SINGLE_PHASE,
      fetchPeaks: async () => ({ minutes: [], truncated: true }),
    });
    expect(result.recommendedVa).toBe(10_350);
    expect(result.evaluations.at(-1)).toMatchObject({ tierVa: 6900, status: 'unknown' });
  });

  it('has no answer above the highest tier', async () => {
    const result = await recommendTier({
      peak: 60_000,
      marginPct: 0,
      curve: SINGLE_PHASE,
      fetchPeaks,
    });
    expect(result).toEqual({ recommendedVa: null, evaluations: [] });
  });
});

describe('savings', () => {
  const tariff: TariffInput = {
    validFrom: '2026-01-01',
    supplier: 'ACME',
    powerVa: 6900,
    option: 'simple',
    cycle: 'daily',
    periodsMap: 'pre-2027',
    fixedPerDay: 343_600,
    energy: { simple: 166_500 },
    iecPerKwh: 1_000,
    cavPerMonth: 2_850_000,
    dgegPerMonth: 70_000,
    largeFamily: false,
    energyDiscountBp: 0,
    socialEnergyPerKwh: 0,
    socialPowerPerDay: 0,
    socialFinancingPerKwh: 0,
  };
  const offer = (id: string, supplier: string, at69: number, at575: number): Offer => ({
    id,
    supplier,
    name: id,
    segment: 'Dom',
    supply: 'ELE',
    durationMonths: 12,
    validFrom: null,
    validTo: null,
    loyalty: false,
    indexedPrices: false,
    renewable: false,
    restrictions: false,
    requiredServices: false,
    servicesPerYearWithVat: 0,
    discounts: { fixedPerYear: 0, fixedTermPct: 0, energyPct: 0, energyPerKwh: 0 },
    newClientDiscounts: { fixedPerYearWithVat: 0, fixedTermPct: 0, energyPct: 0, energyPerKwh: 0 },
    payment: { directDebit: true, multibanco: true, cash: false },
    billing: { electronic: true, paper: false },
    links: {},
    texts: {},
    prices: {
      '6.9': { '1': { fixedPerDay: at69, simple: 0.16 } },
      '5.75': { '1': { fixedPerDay: at575, simple: 0.16 } },
    },
  });

  it('takes the lower tier price from an ERSE offer with the same fixed term, supplier first', () => {
    const offers = [
      offer('X', 'Outro', 0.3436, 0.28),
      offer('A', 'ACME', 0.3436, 0.29),
      offer('B', 'ACME', 0.35, 0.2),
    ];
    expect(offerFixedPerDay(offers, tariff, 5750)).toMatchObject({
      fixedPerDay: 290_000,
      offer: { id: 'A' },
    });
    expect(offerFixedPerDay(offers, { ...tariff, supplier: null }, 5750)?.offer.id).toBe('X');
    expect(offerFixedPerDay(offers, { ...tariff, fixedPerDay: 300_000 }, 5750)).toBeNull();
  });

  it('a year of fixed term with VAT (23 %)', () => {
    // 365 × 0,3436 = 125,414 € × 1,23 = 154,26 €; 365 × 0,29 = 105,85 € × 1,23 = 130,20 €.
    expect(annualFixedCents(tariff, 6900, 343_600)).toBe(15_426);
    expect(annualFixedCents(tariff, 5750, 290_000)).toBe(13_020);
  });
});
