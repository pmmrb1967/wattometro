// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MARGIN_PCT,
  recommendTier,
  SINGLE_PHASE,
  type PeakMinute,
} from '../../domain/contracted-power';
import type { Tariff } from '../../domain/tariff';
import { VOLTAGE_LIMITS, voltageEpisodes, yearSummary, type Outage } from '../../domain/voltage';
import { startOfLisbonDay } from '../../lib/time';
import { formatKva } from '../../lib/units';
import { GRID_TOOLS } from './grid-tools';
import { runTool, type PowerFacts, type QualityFacts, type ToolContext } from './tool';

const tariff: Tariff = {
  id: 't1',
  validFrom: '2025-01-01',
  supplier: 'Atual',
  powerVa: 6900,
  option: 'simple',
  cycle: 'daily',
  periodsMap: 'pre-2027',
  fixedPerDay: 300_000,
  energy: { simple: 160_000 },
  iecPerKwh: 0,
  cavPerMonth: 0,
  dgegPerMonth: 0,
  largeFamily: false,
  energyDiscountBp: 0,
  socialEnergyPerKwh: 0,
  socialPowerPerDay: 0,
  socialFinancingPerKwh: 0,
};

function context(power: PowerFacts | null, quality: QualityFacts | null = null): ToolContext {
  return {
    today: '2026-10-25',
    quarters: [],
    yearFrom: 0,
    tariffs: [tariff],
    daily: null,
    offers: async () => [],
    power: async () => power,
    quality: async () => quality,
    appliances: async () => null,
  };
}

async function call(name: string, ctx: ToolContext) {
  const outcome = await runTool(GRID_TOOLS, name, {}, ctx);
  if (!outcome.ok) throw new Error(outcome.error);
  return outcome.result as Record<string, unknown>;
}

describe('recommend_contracted_power', () => {
  it('recommends what the Potência page recommends', async () => {
    // A 4,2 kVA peak and nothing near any lower threshold.
    const facts: PowerFacts = {
      kind: 'shelly',
      meterName: 'Quadro',
      periodDays: 90,
      peak: 4200,
      fetchPeaks: async () => ({ minutes: [] as PeakMinute[], truncated: false }),
    };
    const expected = await recommendTier({
      peak: facts.peak,
      marginPct: DEFAULT_MARGIN_PCT,
      curve: SINGLE_PHASE,
      fetchPeaks: facts.fetchPeaks,
    });
    const result = await call('recommend_contracted_power', context(facts));
    expect(result.recommended).toBe(formatKva(expected.recommendedVa!));
    expect(result.current).toBe('6,9\u00a0kVA');
    expect(result.comparedWithCurrent).toBe('lower');
    // No ERSE offer matches the contract's fixed term: no saving claimed.
    expect(result.powerTermSavingPerYear).toBeNull();
    expect((result.tiers as unknown[]).length).toBe(expected.evaluations.length);
  });

  it('says why there is no recommendation with E-Redes alone', async () => {
    const result = await call(
      'recommend_contracted_power',
      context({ kind: 'eredes', maxQuarterW: 3200 }),
    );
    expect(result).toMatchObject({ highestQuarterAverage: '3,20\u00a0kW' });
    expect(result.recommended).toBeUndefined();
  });

  it('reports unavailable data without failing', async () => {
    expect(await call('recommend_contracted_power', context(null))).toEqual({
      note: 'The power data could not be read now.',
    });
  });
});

describe('get_voltage_events', () => {
  const monday = startOfLisbonDay('2026-10-19');
  // A week at 230 V, every 10 minutes; three minutes at 200 V on Wednesday.
  const intervals = Array.from({ length: 1008 }, (_, i) => ({ ts: monday + i * 600, avgDv: 2300 }));
  const wednesday = startOfLisbonDay('2026-10-21') + 20 * 3600;
  const outside = [0, 1, 2].map((i) => ({ ts: wednesday + i * 60, minDv: 2000, maxDv: 2050 }));
  const outage: Outage = {
    start: startOfLisbonDay('2026-03-02'),
    end: startOfLisbonDay('2026-03-02') + 4 * 3600,
    boots: [{ deviceId: 'd1', bootAt: startOfLisbonDay('2026-03-02') + 4 * 3600 }],
    seconds: 4 * 3600,
    long: true,
    excluded: false,
  };
  const facts: QualityFacts = {
    zone: 'C',
    year: 2026,
    weeks: 4,
    outages: [outage],
    meters: [{ name: 'Quadro', intervals, outside }],
    truncated: false,
  };

  it('gives the Qualidade page’s outages, weeks and episodes', async () => {
    const result = await call('get_voltage_events', context(null, facts));
    const summary = yearSummary([outage], 2026, 'C');
    expect(result.outages).toMatchObject({ long: summary.longCount, short: summary.shortCount });
    const [meter] = result.meters as {
      weeks: { meetsStandard: boolean }[];
      episodes: number;
      list: { kind: string; extreme: string }[];
    }[];
    expect(meter?.weeks).toEqual([expect.objectContaining({ meetsStandard: true })]);
    expect(meter?.episodes).toBe(voltageEpisodes(outside, VOLTAGE_LIMITS, 1).length);
    expect(meter?.list[0]).toMatchObject({ kind: 'low', extreme: '200,0\u00a0V' });
  });
});
