// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The demonstration's answers built from the generated data, in the shapes of
 * the Worker (server/src/routes/): now, quality, power, energy, seconds, prices.
 */
import { addDays } from '../domain/consumption';
import { encodeSeconds, READINGS_1S_BYTES } from '../lib/readings-1s';
import { lisbonDate, lisbonToday, nextDate, startOfLisbonDay, startOfMadridDay } from '../lib/time';
import { type DemoData } from './model';
import {
  DAY,
  DEVICE_ID,
  type DemoSignature,
  type DemoState,
  METER,
  MINUTE,
  signatureRange,
} from './state';

const EREDES_LAG_DAYS = 3;

const TOP_QUARTERS = 10;

const MAX_PEAK_MINUTES = 1440;

const PEAK_RECORD_BYTES = 4 + 4 + 4 + 1 + READINGS_1S_BYTES;

function presentMinutes(data: DemoData, from: number, to: number): number {
  const [first, last] = minuteRange(data, from, to);
  let count = 0;
  for (let index = first; index < last; index++) if (data.present[index]) count++;
  return count;
}

export function signatureView(data: DemoData, signature: DemoSignature) {
  return {
    ...signature,
    meter: METER,
    minutes: presentMinutes(data, ...signatureRange(signature)),
  };
}

/** Indexes of the minutes in [from, to). */
function minuteRange(data: DemoData, from: number, to: number): [number, number] {
  const first = Math.max(0, Math.ceil((from - data.start) / MINUTE));
  const last = Math.min(data.count, Math.ceil((to - data.start) / MINUTE));
  return [first, Math.max(first, last)];
}

export function devices(data: DemoData) {
  return [
    {
      id: DEVICE_ID,
      name: 'Quadro geral',
      model: 'S3EM-002CXCEU',
      firmware: '1.4.4',
      scriptVersion: '0.2.0',
      createdAt: data.start - DAY,
      lastSeenAt: data.now,
    },
  ];
}

function minuteView(data: DemoData, index: number) {
  return {
    ts: data.start + index * MINUTE,
    powerAvgW: data.powerAvgW[index] as number,
    powerMinW: data.powerMinW[index] as number,
    powerMaxW: data.powerMaxW[index] as number,
    voltageAvgDv: data.voltageAvgDv[index] as number,
    voltageMinDv: data.voltageMinDv[index] as number,
    voltageMaxDv: data.voltageMaxDv[index] as number,
    pfAvgPct: data.pfAvgPct[index] as number,
  };
}

export function now(data: DemoData) {
  const dayStart = startOfLisbonDay(lisbonDate(data.now));
  const [first, last] = minuteRange(data, dayStart, data.now);
  let minutes = 0;
  let energyWh = 0;
  let powerMaxW: number | null = null;
  let latest: number | null = null;
  const quarters = new Map<number, number>();
  for (let index = first; index < last; index++) {
    if (!data.present[index]) continue;
    const ts = data.start + index * MINUTE;
    const wh = data.energyWh[index] as number;
    minutes += 1;
    energyWh += wh;
    powerMaxW = Math.max(powerMaxW ?? 0, data.powerMaxW[index] as number);
    quarters.set(ts - (ts % 900), (quarters.get(ts - (ts % 900)) ?? 0) + wh);
    latest = index;
  }
  return {
    now: data.now,
    dayStart,
    meters: [
      {
        deviceId: DEVICE_ID,
        deviceName: 'Quadro geral',
        channel: 0,
        lastSeenAt: data.now,
        latest: latest === null ? null : minuteView(data, latest),
        today: {
          minutes,
          energyWh,
          powerMaxW,
          quarters: [...quarters].map(([ts, wh]) => ({ ts, energyWh: wh })),
        },
      },
    ],
    database: {
      sizeBytes: 31_000_000,
      limitBytes: 500_000_000,
      rowsReadToday: 40_000,
      rowsReadLimit: 5_000_000,
    },
  };
}

/** The Shelly's boots, as the server records them: start = end of the last minute before. */
export function boots(demo: DemoState) {
  const { data } = demo;
  const list: { deviceId: string; bootAt: number; startAt: number | null }[] = [
    { deviceId: DEVICE_ID, bootAt: data.events.firstBoot, startAt: null },
  ];
  for (const outage of data.events.outages) {
    let index = Math.floor((outage.end - data.start) / MINUTE);
    while (index > 0 && (index >= data.count || !data.present[index])) index -= 1;
    list.push({
      deviceId: DEVICE_ID,
      bootAt: outage.end,
      startAt: data.start + (index + 1) * MINUTE,
    });
  }
  return list.map((boot) => ({ ...boot, excluded: demo.excluded.has(boot.bootAt) }));
}

export function quality(demo: DemoState, from: number, to: number, low: number, high: number) {
  const { data } = demo;
  const [first, last] = minuteRange(data, from, to);
  const intervals = new Map<number, [number, number, number, number, number]>();
  const sums = new Map<number, number>();
  const outside: [number, number, number][] = [];
  for (let index = first; index < last; index++) {
    if (!data.present[index]) continue;
    const ts = data.start + index * MINUTE;
    const min = data.voltageMinDv[index] as number;
    const max = data.voltageMaxDv[index] as number;
    const avg = data.voltageAvgDv[index] as number;
    const bucket = ts - (ts % 600);
    const interval = intervals.get(bucket) ?? [bucket, 0, 0, min, max];
    interval[1] += 1;
    interval[3] = Math.min(interval[3], min);
    interval[4] = Math.max(interval[4], max);
    intervals.set(bucket, interval);
    sums.set(bucket, (sums.get(bucket) ?? 0) + avg);
    if (min < low || max > high) outside.push([ts, min, max]);
  }
  for (const [bucket, interval] of intervals) {
    interval[2] = Math.round((sums.get(bucket) ?? 0) / interval[1]);
  }
  return {
    zone: demo.zone,
    devices: [{ id: DEVICE_ID, name: 'Quadro geral' }],
    intervals: intervals.size > 0 ? [{ meter: METER, intervals: [...intervals.values()] }] : [],
    outside: outside.length > 0 ? [{ meter: METER, minutes: outside }] : [],
    outsideTruncated: false,
  };
}

export function power(data: DemoData, from: number, to: number) {
  const [first, last] = minuteRange(data, from, to);
  let minutes = 0;
  let apparentMaxVa: number | null = null;
  let activeMaxW: number | null = null;
  const quarters = new Map<number, number>();
  const days = new Map<string, number>();
  for (let index = first; index < last; index++) {
    if (!data.present[index]) continue;
    const ts = data.start + index * MINUTE;
    const va = data.apparentMaxVa[index] as number;
    const day = lisbonDate(ts);
    days.set(day, Math.max(days.get(day) ?? 0, va));
    minutes += 1;
    apparentMaxVa = Math.max(apparentMaxVa ?? 0, va);
    activeMaxW = Math.max(activeMaxW ?? 0, data.powerMaxW[index] as number);
    const quarter = ts - (ts % 900);
    quarters.set(quarter, Math.max(quarters.get(quarter) ?? 0, va));
  }
  const top = [...quarters]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, TOP_QUARTERS)
    .map(([ts, peak]) => ({ ts, peak, estimated: false }));
  return {
    devices: [{ id: DEVICE_ID, name: 'Quadro geral' }],
    meters:
      minutes === 0
        ? []
        : [
            {
              meter: METER,
              minutes,
              apparentMinutes: minutes,
              apparentMaxVa,
              activeMaxW,
              activeOnlyMaxW: null,
              top,
            },
          ],
    days: [...days].map(([day, peak]) => ({ meter: METER, day, peak, estimated: false })),
    eredes: { quarters: 0, maxEnergyWh: null },
  };
}

/** Energy per quarter hour in [from, to): [start, Wh] (as readings_15m). */
function quarterEnergy(data: DemoData, from: number, to: number): [number, number][] {
  const [first, last] = minuteRange(data, from, to);
  const quarters = new Map<number, number>();
  for (let index = first; index < last; index++) {
    if (!data.present[index]) continue;
    const ts = data.start + index * MINUTE;
    const quarter = ts - (ts % 900);
    quarters.set(quarter, (quarters.get(quarter) ?? 0) + (data.energyWh[index] as number));
  }
  return [...quarters];
}

/** The quarters of a meter: the Shelly's, or the E-Redes import (the same, ending earlier). */
export function meterQuarters(data: DemoData, meter: string, from: number, to: number) {
  if (meter === METER) return quarterEnergy(data, from, to);
  const end = Math.min(to, startOfLisbonDay(addDays(lisbonToday(), -EREDES_LAG_DAYS)));
  return meter === 'eredes' && from < end
    ? quarterEnergy(data, from, end).map(([ts, wh]): [number, number] => [
        ts,
        Math.round(wh * 0.98),
      ])
    : null;
}

/** Records of GET /v1/seconds (server/src/repo/seconds.ts). */
export function secondsRecords(data: DemoData, from: number, to: number): Response {
  const [first, last] = minuteRange(data, from, to);
  const chosen: number[] = [];
  for (let index = first; index < last; index++) if (data.present[index]) chosen.push(index);
  const records = new Uint8Array(chosen.length * (4 + READINGS_1S_BYTES));
  const view = new DataView(records.buffer);
  chosen.forEach((index, position) => {
    const offset = position * (4 + READINGS_1S_BYTES);
    view.setUint32(offset, data.start + index * MINUTE, true);
    records.set(encodeSeconds(data.seconds(index)), offset + 4);
  });
  return new Response(records, { headers: { 'Content-Type': 'application/octet-stream' } });
}

/** Records of GET /v1/power/peaks (server/src/repo/power.ts). */
export function peaks(data: DemoData, from: number, to: number, threshold: number): Response {
  const [first, last] = minuteRange(data, from, to);
  const chosen: number[] = [];
  for (let index = first; index < last; index++) {
    if (data.present[index] && (data.apparentMaxVa[index] as number) > threshold) {
      chosen.push(index);
    }
  }
  const kept = chosen.slice(0, MAX_PEAK_MINUTES);
  const records = new Uint8Array(kept.length * PEAK_RECORD_BYTES);
  const view = new DataView(records.buffer);
  kept.forEach((index, position) => {
    const offset = position * PEAK_RECORD_BYTES;
    view.setUint32(offset, data.start + index * MINUTE, true);
    view.setInt32(offset + 4, data.powerMaxW[index] as number, true);
    view.setInt32(offset + 8, data.apparentMaxVa[index] as number, true);
    view.setUint8(offset + 12, 1);
    records.set(encodeSeconds(data.seconds(index)), offset + 13);
  });
  return new Response(records, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Truncated': chosen.length > MAX_PEAK_MINUTES ? '1' : '0',
    },
  });
}

/**
 * Invented market prices for today and tomorrow (GET /v1/omie), € per MWh for
 * each Lisbon hour: cheap at midday (sun), dear in the evening. Not OMIE's.
 */
const DEMO_MARKET = [
  95, 90, 88, 86, 85, 88, 100, 120, 110, 80, 50, 30, 20, 18, 20, 35, 60, 110, 160, 190, 170, 140,
  120, 105,
];

export function demoOmieDays() {
  const today = lisbonToday();
  return [today, nextDate(today)].map((date, day) => ({
    date,
    start: startOfMadridDay(date),
    step: 900,
    // The OMIE day starts at 23:00 in Lisbon.
    prices: Array.from(
      { length: 96 },
      (_, i) => (DEMO_MARKET[(23 + Math.floor(i / 4)) % 24] as number) * (100 + day * 5),
    ),
  }));
}
