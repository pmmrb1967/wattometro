// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { addDays } from '../domain/consumption';
import { demoResponse } from '../demo/server';
import { toBase64Url } from '../lib/base64url';
import { lisbonToday, nextDate, startOfLisbonDay } from '../lib/time';
import { analyseDay } from './day';
import { decodeSecondsRecords } from './series';
import { analysisOf, decodeDay, encodeDay, NILM_VERSION } from './stored';

async function demoDay() {
  const day = addDays(lisbonToday(), -2);
  const query = `meter=demo-shelly:0&from=${startOfLisbonDay(day)}&to=${startOfLisbonDay(nextDate(day))}`;
  const response = demoResponse('GET', `/v1/seconds?${query}`);
  const records = await response.arrayBuffer();
  return analyseDay(decodeSecondsRecords(records), day);
}

async function gzip(text: string) {
  const piped = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return toBase64Url(new Uint8Array(await new Response(piped).arrayBuffer()));
}

describe('stored NILM days', () => {
  it('keeps the fridge of the day, for its history', async () => {
    const analysis = await demoDay();
    const fridge = {
      powerW: 28,
      onPct: 84,
      energyWh: 560,
      pauses: [{ start: 1000, end: 2200, lowW: 96 }],
    };
    expect((await decodeDay(await encodeDay({ ...analysis, fridge })))?.fridge).toEqual(fridge);
    const unknown = { ...fridge, onPct: null, energyWh: null };
    expect((await decodeDay(await encodeDay({ ...analysis, fridge: unknown })))?.fridge).toEqual(
      unknown,
    );
    const none = await decodeDay(await encodeDay({ ...analysis, fridge: null }));
    expect(none?.fridge).toBeNull();
  });

  it('gives back the same cycles, quarters and groups', async () => {
    const analysis = await demoDay();
    expect(analysis.cycles.length).toBeGreaterThan(10);
    const data = await encodeDay(analysis);
    const back = await decodeDay(data);
    expect(back).toEqual({
      day: analysis.day,
      minutes: analysis.minutes,
      energyWh: analysis.energyWh,
      quarters: analysis.quarters,
      cycles: analysis.cycles,
      fridge: analysis.fridge,
    });
    expect(analysisOf(back as NonNullable<typeof back>).groups).toEqual(analysis.groups);
    // A demonstration day of seconds (~520 KB) keeps in a few KB.
    expect(data.length).toBeLessThan(20_000);
  });

  it('keeps the rhythm of a run of pulses', async () => {
    const analysis = await demoDay();
    const first = analysis.cycles[0]!;
    const pulsing = { ...first, pulses: { count: 20, onS: 600, periodS: 44 } };
    const back = await decodeDay(await encodeDay({ ...analysis, cycles: [pulsing] }));
    expect(back?.cycles[0]?.pulses).toEqual({ count: 20, onS: 600, periodS: 44 });
  });

  it('refuses another version and what cannot be read', async () => {
    const empty = {
      day: '2026-10-27',
      minutes: 0,
      energyWh: 0,
      quarters: [],
      cycles: [],
      fridge: null,
    };
    expect(await decodeDay(await gzip(JSON.stringify({ v: NILM_VERSION, ...empty })))).toEqual(
      empty,
    );
    expect(await decodeDay(await gzip(JSON.stringify({ v: NILM_VERSION + 1, ...empty })))).toBe(
      null,
    );
    expect(await decodeDay(await gzip('{"v": 1}'))).toBeNull();
    expect(await decodeDay('AAEC')).toBeNull();
  });
});
