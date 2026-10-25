// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The data the AI's tools work on (src/ai/tools/), from what the pages
 * already loaded (the house's quarters, tariffs and weather) plus what
 * "Potência" and "Qualidade" ask the Worker for, with their default periods.
 * Those two are only asked for when a tool needs them, once per question.
 */
import type { PowerFacts, QualityFacts, ToolContext } from '../ai/tools/tool';
import { decodePeaks, periodPeak } from '../domain/contracted-power';
import { mondayOf, outagesFromBoots, VOLTAGE_LIMITS } from '../domain/voltage';
import { lisbonDate, lisbonParts, lisbonToday, startOfLisbonDay } from '../lib/time';
import { fetchBoots, fetchOffers, fetchPeakRecords, fetchPower, fetchQuality } from './api';
import type { HouseholdEnergy } from './household-energy';
import { shellyName } from './meters';
import type { Weather } from './use-weather';

const DAY = 86_400;
/** As on "Potência" (the per-second retention). */
const POWER_PERIOD_DAYS = 90;
/** As on "Qualidade" by default. */
const QUALITY_WEEKS = 4;

async function loadPower(now: number): Promise<PowerFacts | null> {
  const from = now - POWER_PERIOD_DAYS * DAY;
  const outcome = await fetchPower(from, now);
  if (!outcome.ok) return null;
  const { meters, devices, eredes } = outcome.power;
  // The meter with most data is likely the main one (the whole house), as on the page.
  const meter = [...meters].sort((a, b) => b.minutes - a.minutes)[0];
  if (!meter) {
    return {
      kind: 'eredes',
      maxQuarterW:
        eredes.quarters > 0 && eredes.maxEnergyWh !== null ? eredes.maxEnergyWh * 4 : null,
    };
  }
  return {
    kind: 'shelly',
    meterName: shellyName(meter.meter, devices),
    periodDays: POWER_PERIOD_DAYS,
    peak: periodPeak(meter),
    fetchPeaks: async (threshold) => {
      const peaks = await fetchPeakRecords(meter.meter, from, now, threshold);
      if (!peaks.ok) throw new Error('The peaks could not be read now.');
      return { minutes: decodePeaks(peaks.records), truncated: peaks.truncated };
    },
  };
}

async function loadQuality(now: number): Promise<QualityFacts | null> {
  const year = lisbonParts(now).year;
  // Whole weeks: from the Monday (weeks − 1) weeks before this one.
  const from = startOfLisbonDay(mondayOf(lisbonDate(now - (QUALITY_WEEKS - 1) * 7 * DAY)));
  // The year and the period, from a day before so an outage across midnight is whole.
  const bootsFrom = Math.min(startOfLisbonDay(`${year}-01-01`), from) - DAY;
  const [quality, boots] = await Promise.all([
    fetchQuality(from, now, VOLTAGE_LIMITS.lowDv, VOLTAGE_LIMITS.highDv),
    fetchBoots(bootsFrom, now + 1),
  ]);
  if (!quality.ok || !boots.ok) return null;
  const data = quality.quality;
  return {
    zone: data.zone,
    year,
    weeks: QUALITY_WEEKS,
    outages: outagesFromBoots(boots.boots),
    meters: data.intervals.map(({ meter, intervals }) => ({
      name: shellyName(meter, data.devices),
      intervals: intervals.map(([ts, , avgDv]) => ({ ts, avgDv })),
      outside: (data.outside.find((item) => item.meter === meter)?.minutes ?? []).map(
        ([ts, minDv, maxDv]) => ({ ts, minDv, maxDv }),
      ),
    })),
    truncated: data.outsideTruncated,
  };
}

/** Remembers a load for the rest of the question (a tool may be called twice). */
function once<T>(load: () => Promise<T>): () => Promise<T> {
  let promise: Promise<T> | null = null;
  return () => (promise ??= load());
}

/** Null while the house's data is still loading. */
export function toolContext(
  energy: HouseholdEnergy,
  weather: Weather | undefined,
): ToolContext | null {
  if (
    !energy.quarters ||
    weather === undefined ||
    (energy.tariffs === null && !energy.tariffsFailed)
  ) {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  return {
    today: lisbonToday(),
    quarters: energy.quarters,
    yearFrom: energy.window.yearFrom,
    tariffs: energy.tariffs,
    daily: weather.daily,
    offers: once(async () => (await fetchOffers())?.offers ?? null),
    power: once(() => loadPower(now)),
    quality: once(() => loadQuality(now)),
  };
}
