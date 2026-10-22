// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  decodePeaks,
  offerFixedPerDay,
  recommendTier,
  SINGLE_PHASE,
} from '../domain/contracted-power';
import { offersFileSchema } from '../domain/erse';
import { outagesFromBoots, VOLTAGE_LIMITS, voltageEpisodes } from '../domain/voltage';
import { generateDemo, type DemoData } from './model';
import { DEMO_ME, demoResponse, resetDemo } from './server';

const NOW = Date.parse('2026-10-22T12:00:30Z') / 1000;
let data: DemoData;

beforeAll(() => {
  data = generateDemo(NOW);
});

const get = async (path: string) => (await demoResponse('GET', path)).json();

describe('demo household', () => {
  it('covers the period minute by minute, with integer readings', () => {
    expect(data.now).toBe(NOW - 30);
    expect(data.count).toBeGreaterThan(92 * 1440 - 60);
    const present = data.present.reduce((sum, value) => sum + value, 0);
    // Two outages: about 48 + 2 minutes without data.
    expect(data.count - present).toBeGreaterThanOrEqual(49);
    expect(data.count - present).toBeLessThanOrEqual(51);
    expect(data.energyWh.every((wh) => wh >= 0)).toBe(true);
  });

  it('is the same household on every visit', () => {
    const again = generateDemo(NOW);
    expect(again.powerMaxW).toEqual(data.powerMaxW);
  });
});

describe('demo API, through the app calculations', () => {
  // The demo API builds the household at the current time.
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW * 1000);
    resetDemo();
  });
  afterAll(() => vi.useRealTimers());
  const from = NOW - 90 * 86_400;

  it('recommends 6,9 kVA: only one evening goes near it, and 5,75 kVA would trip', async () => {
    const power = (await get(`/v1/power?from=${from}&to=${NOW}`)) as {
      meters: { meter: string; apparentMaxVa: number }[];
    };
    const meter = power.meters[0]!;
    const result = await recommendTier({
      peak: meter.apparentMaxVa,
      marginPct: 10,
      curve: SINGLE_PHASE,
      fetchPeaks: async (threshold) => {
        const response = demoResponse(
          'GET',
          `/v1/power/peaks?meter=${meter.meter}&from=${from}&to=${NOW}&threshold=${threshold}`,
        );
        return {
          minutes: decodePeaks(await response.arrayBuffer()),
          truncated: response.headers.get('X-Truncated') === '1',
        };
      },
    });
    expect(result.recommendedVa).toBe(6900);
    expect(result.evaluations.map((e) => [e.tierVa, e.status])).toEqual([
      [10_350, 'clear'],
      [6900, 'safe'],
      [5750, 'trips'],
    ]);
  });

  it('finds the demo tariff price in the ERSE offers', async () => {
    const path = join(__dirname, '..', '..', 'public', 'data', 'erse-offers.json');
    const offers = offersFileSchema.parse(JSON.parse(readFileSync(path, 'utf8'))).offers;
    const { tariffs } = (await get('/v1/tariffs')) as { tariffs: never[] };
    expect(offerFixedPerDay(offers, tariffs[0]!, 6900)?.fixedPerDay).toBe(365_900);
  });

  it('has a long and a short outage, and an undervoltage episode', async () => {
    const { outages } = (await get(`/v1/outages?from=${from}&to=${NOW}`)) as {
      outages: Parameters<typeof outagesFromBoots>[0];
    };
    const list = outagesFromBoots(outages);
    expect(list.map((outage) => [outage.long, Math.round(outage.seconds / 60)])).toEqual([
      [true, 48],
      [false, 2],
    ]);

    const week = NOW - 14 * 86_400;
    const quality = (await get(
      `/v1/quality?from=${week}&to=${NOW}&low=${VOLTAGE_LIMITS.lowDv}&high=${VOLTAGE_LIMITS.highDv}`,
    )) as { zone: string; outside: { minutes: [number, number, number][] }[] };
    expect(quality.zone).toBe('B');
    const episodes = voltageEpisodes(
      quality.outside[0]!.minutes.map(([ts, minDv, maxDv]) => ({ ts, minDv, maxDv })),
      VOLTAGE_LIMITS,
      1,
    );
    expect(episodes.map((episode) => [episode.kind, episode.minutes])).toEqual([
      ['high', 1],
      ['low', 25],
    ]);
  });

  it('keeps the account and devices as they are, and changes in memory only', async () => {
    expect(await get('/v1/auth/me')).toEqual(DEMO_ME);
    expect(demoResponse('POST', '/v1/devices', { name: 'x' }).status).toBe(409);
    expect(demoResponse('PUT', '/v1/quality/zone', { zone: 'C' }).status).toBe(204);
    expect(
      ((await get(`/v1/quality?from=${NOW - 600}&to=${NOW}&low=1&high=2`)) as { zone: string })
        .zone,
    ).toBe('C');
    resetDemo();
    expect(
      ((await get(`/v1/quality?from=${NOW - 600}&to=${NOW}&low=1&high=2`)) as { zone: string })
        .zone,
    ).toBe('B');
  });
});
