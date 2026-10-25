// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The tools on the Shelly's per-second peaks and on the voltage, with the
 * same functions and defaults as their pages: recommend_contracted_power
 * ("Potência": 90 days, 10 % margin, single phase) and get_voltage_events
 * ("Qualidade": the last 4 weeks, episodes from 1 minute, the year's outages).
 * Their data is asked from the Worker only when the AI calls them.
 */
import { z } from 'zod';
import {
  annualFixedCents,
  DEFAULT_MARGIN_PCT,
  offerFixedPerDay,
  recommendTier,
  SINGLE_PHASE,
  type TierEvaluation,
} from '../../domain/contracted-power';
import { tariffOn } from '../../domain/tariff';
import {
  VOLTAGE_LIMITS,
  voltageEpisodes,
  weeklyCompliance,
  yearSummary,
} from '../../domain/voltage';
import { formatCents } from '../../lib/money';
import { formatDuration, formatLisbonDateTime } from '../../lib/time';
import { formatKva, formatPower, formatVolts } from '../../lib/units';
import { defineTool } from './tool';

/** Voltage episodes listed per meter. */
const MAX_EPISODES = 10;

function tierText(evaluation: TierEvaluation) {
  const simulation = evaluation.simulation;
  const result =
    evaluation.status === 'clear'
      ? 'Never near the limit.'
      : evaluation.status === 'unknown'
        ? 'Too many minutes near the limit to check.'
        : evaluation.status === 'safe'
          ? simulation?.closest
            ? `Would not have tripped; closest: ${simulation.closest.progressPct} % of the way to a cut, ${formatLisbonDateTime(simulation.closest.ts)}.`
            : 'Would not have tripped.'
          : `Would have tripped ${simulation?.trips.length ?? 0} times, first ${simulation?.trips[0] ? `${formatLisbonDateTime(simulation.trips[0].ts)} at ${formatKva(simulation.trips[0].va)}` : ''}.`;
  return { tier: formatKva(evaluation.tierVa), result };
}

const contractedPower = defineTool({
  name: 'recommend_contracted_power',
  description:
    'As on the "Potência" page: from the Shelly\'s one-second peaks of the last 90 days, the lowest contracted power that would not have tripped (with a 10 % safety margin and the meter\'s trip curve), each tier checked, the current contract, and the yearly saving on the power term at the recommended tier (price from an ERSE offer matching the current one). Without a Shelly only the E-Redes quarter hours exist, which hide short peaks.',
  input: z.strictObject({}),
  async run(_input, context) {
    const facts = await context.power();
    if (!facts) return { note: 'The power data could not be read now.' };
    if (facts.kind === 'eredes') {
      return {
        note: 'No Shelly: only E-Redes quarter-hour averages, which hide the short peaks that trip the meter. No recommendation.',
        highestQuarterAverage: facts.maxQuarterW !== null ? formatPower(facts.maxQuarterW) : null,
      };
    }
    const tariff = context.tariffs ? tariffOn(context.tariffs, context.today) : null;
    const recommendation = await recommendTier({
      peak: facts.peak,
      marginPct: DEFAULT_MARGIN_PCT,
      curve: SINGLE_PHASE,
      fetchPeaks: facts.fetchPeaks,
    });
    const recommendedVa = recommendation.recommendedVa;
    let saving: string | null = null;
    if (tariff && recommendedVa !== null && recommendedVa < tariff.powerVa) {
      const offers = await context.offers();
      const match = offers ? offerFixedPerDay(offers, tariff, recommendedVa) : null;
      if (match) {
        saving = formatCents(
          annualFixedCents(tariff, tariff.powerVa, tariff.fixedPerDay) -
            annualFixedCents(tariff, recommendedVa, match.fixedPerDay),
        );
      }
    }
    return {
      meter: facts.meterName,
      periodDays: facts.periodDays,
      highestOneSecond: formatKva(facts.peak),
      marginPct: DEFAULT_MARGIN_PCT,
      current: tariff ? formatKva(tariff.powerVa) : null,
      recommended:
        recommendedVa !== null ? formatKva(recommendedVa) : 'Even the highest tier would trip.',
      ...(tariff && recommendedVa !== null
        ? {
            comparedWithCurrent:
              recommendedVa === tariff.powerVa
                ? 'same'
                : recommendedVa < tariff.powerVa
                  ? 'lower'
                  : 'higher',
          }
        : {}),
      powerTermSavingPerYear: saving,
      tiers: recommendation.evaluations.map(tierText),
    };
  },
});

const voltage = defineTool({
  name: 'get_voltage_events',
  description:
    'As on the "Qualidade" page: the year\'s outages against the standard of the quality zone (RQS), and for the last 4 weeks the voltage of each Shelly per week against NP EN 50160 (230 V ± 10 % for 95 % of the 10-minute intervals) and the episodes outside the band. Facts for a complaint to the distributor.',
  input: z.strictObject({}),
  async run(_input, context) {
    const facts = await context.quality();
    if (!facts) return { note: 'The voltage data could not be read now.' };
    const summary = yearSummary(facts.outages, facts.year, facts.zone);
    return {
      limits: {
        band: `${formatVolts(VOLTAGE_LIMITS.lowDv)} – ${formatVolts(VOLTAGE_LIMITS.highDv)}`,
        floor: formatVolts(VOLTAGE_LIMITS.floorDv),
      },
      outages: {
        year: facts.year,
        long: summary.longCount,
        longDuration: formatDuration(summary.longSeconds),
        short: summary.shortCount,
        excludedByUser: summary.excludedCount,
        zone: facts.zone,
        standard: summary.standard
          ? `${summary.standard.interruptions} long outages or ${summary.standard.hours} h per year`
          : 'Zone not set (Qualidade page).',
        overStandard: summary.standard ? summary.overCount || summary.overHours : null,
      },
      weeks: facts.weeks,
      meters: facts.meters.map((meter) => {
        const episodes = voltageEpisodes(meter.outside, VOLTAGE_LIMITS, 1);
        return {
          name: meter.name,
          weeks: weeklyCompliance(meter.intervals, facts.outages, VOLTAGE_LIMITS).map((week) => ({
            week: week.week,
            evaluatedIntervals: week.evaluated,
            outsideBand: week.outsideBand,
            meetsStandard: week.meetsBand && week.meetsLimits,
          })),
          episodes: episodes.length,
          list: episodes.slice(-MAX_EPISODES).map((episode) => ({
            start: formatLisbonDateTime(episode.start),
            duration: formatDuration(episode.end - episode.start),
            kind: episode.kind === 'low' ? 'low' : 'high',
            extreme: formatVolts(episode.extremeDv),
          })),
        };
      }),
      ...(facts.truncated
        ? { note: 'Too many minutes outside the band: the list is partial.' }
        : {}),
    };
  },
});

export const GRID_TOOLS = [contractedPower, voltage];
