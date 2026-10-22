// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The API of the demonstration mode, answered in the browser from the
 * fictional household (model.ts): the same routes and response shapes as
 * server/src/app.ts, so the pages and src/app/api.ts work unchanged. Nothing is
 * sent to the server. Changes (tariff, zone, outages not counted) live in
 * memory until the demonstration ends; the account and devices cannot change
 * (409 {error: 'demo'}).
 */
import { tariffInputSchema, type Tariff } from '../domain/tariff';
import { encodeSeconds, READINGS_1S_BYTES } from '../lib/readings-1s';
import { lisbonDate, startOfLisbonDay } from '../lib/time';
import { DEMO_DAYS, generateDemo, type DemoData } from './model';

const MINUTE = 60;
const DAY = 86_400;
const DEVICE_ID = 'demo-shelly';
const METER = `${DEVICE_ID}:0`;
const TOP_QUARTERS = 10;
const MAX_PEAK_MINUTES = 1440;
const PEAK_RECORD_BYTES = 4 + 4 + 4 + 1 + READINGS_1S_BYTES;

export const DEMO_ME = {
  email: 'demonstracao@wattometro',
  householdId: 'demo',
  householdName: 'Casa de exemplo',
};

interface DemoState {
  data: DemoData;
  tariffs: Tariff[];
  zone: 'A' | 'B' | 'C' | null;
  excluded: Set<number>;
}

let state: DemoState | null = null;

/**
 * The regulated tariff (TUR) at 10,35 kVA, simple, as in the ERSE offers of
 * October 2026: the "Potência" page finds the same price there for 6,9 kVA.
 */
function demoTariff(data: DemoData): Tariff {
  return {
    id: 'demo-tariff',
    validFrom: lisbonDate(data.start),
    supplier: 'TUR',
    powerVa: 10_350,
    option: 'simple',
    cycle: 'daily',
    periodsMap: 'pre-2027',
    fixedPerDay: 539_700,
    energy: { simple: 171_100 },
    iecPerKwh: 1_000,
    cavPerMonth: 2_850_000,
    dgegPerMonth: 70_000,
    largeFamily: false,
    energyDiscountBp: 0,
    socialEnergyPerKwh: 0,
    socialPowerPerDay: 0,
    socialFinancingPerKwh: 0,
  };
}

function current(): DemoState {
  if (!state) {
    const data = generateDemo(Math.floor(Date.now() / 1000));
    state = { data, tariffs: [demoTariff(data)], zone: 'B', excluded: new Set() };
  }
  return state;
}

/** Forgets the household and its changes (when the demonstration ends). */
export function resetDemo(): void {
  state = null;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const empty = (status = 204) => new Response(null, { status });
const readOnly = () => json({ error: 'demo' }, 409);
const invalid = () => json({ error: 'invalid_request' }, 400);

/** Indexes of the minutes in [from, to). */
function minuteRange(data: DemoData, from: number, to: number): [number, number] {
  const first = Math.max(0, Math.ceil((from - data.start) / MINUTE));
  const last = Math.min(data.count, Math.ceil((to - data.start) / MINUTE));
  return [first, Math.max(first, last)];
}

function devices(data: DemoData) {
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

function now(data: DemoData) {
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
    database: { sizeBytes: 31_000_000, limitBytes: 500_000_000 },
  };
}

/** The Shelly's boots, as the server records them: start = end of the last minute before. */
function boots(demo: DemoState) {
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

function quality(demo: DemoState, from: number, to: number, low: number, high: number) {
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

function power(data: DemoData, from: number, to: number) {
  const [first, last] = minuteRange(data, from, to);
  let minutes = 0;
  let apparentMaxVa: number | null = null;
  let activeMaxW: number | null = null;
  const quarters = new Map<number, number>();
  for (let index = first; index < last; index++) {
    if (!data.present[index]) continue;
    const ts = data.start + index * MINUTE;
    const va = data.apparentMaxVa[index] as number;
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

/** Records of GET /v1/energy/quarters (server/src/repo/eredes.ts): uint32 ts · uint32 Wh. */
function energyRecords(quarters: [number, number][]): Response {
  const records = new Uint8Array(quarters.length * 8);
  const view = new DataView(records.buffer);
  quarters.forEach(([ts, wh], index) => {
    view.setUint32(index * 8, ts, true);
    view.setUint32(index * 8 + 4, wh, true);
  });
  return new Response(records, { headers: { 'Content-Type': 'application/octet-stream' } });
}

/** Records of GET /v1/power/peaks (server/src/repo/power.ts). */
function peaks(data: DemoData, from: number, to: number, threshold: number): Response {
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

const numberParam = (url: URL, name: string) => {
  const value = Number(url.searchParams.get(name));
  return Number.isInteger(value) ? value : null;
};

/** Answers one API request of the demonstration. */
export function demoResponse(method: string, path: string, body?: unknown): Response {
  const url = new URL(path, 'https://demo.invalid');
  const route = `${method} ${url.pathname}`;
  const demo = current();
  const { data } = demo;
  const from = numberParam(url, 'from');
  const to = numberParam(url, 'to');
  const range = from !== null && to !== null && from < to && to - from <= DEMO_DAYS * DAY;

  switch (route) {
    case 'GET /v1/auth/me':
      return json(DEMO_ME);
    case 'POST /v1/auth/logout':
      return empty();
    case 'GET /v1/devices':
      return json({ devices: devices(data) });
    case 'GET /v1/now':
      return json(now(data));
    case 'GET /v1/energy': {
      if (from === null || to === null || from >= to) return invalid();
      const quarters = quarterEnergy(data, from, to);
      return json({
        meters:
          quarters.length === 0
            ? []
            : [
                {
                  meter: METER,
                  quarters: quarters.length,
                  energyWh: quarters.reduce((sum, [, wh]) => sum + wh, 0),
                },
              ],
      });
    }
    case 'GET /v1/energy/quarters':
      if (from === null || to === null || url.searchParams.get('meter') !== METER) {
        return invalid();
      }
      return energyRecords(quarterEnergy(data, from, to));
    case 'GET /v1/import/eredes':
      return json({ quarters: 0, estimated: 0, energyWh: 0, from: null, to: null });
    case 'GET /v1/tariffs':
      return json({ tariffs: demo.tariffs });
    case 'POST /v1/tariffs': {
      const parsed = tariffInputSchema.safeParse(body);
      if (!parsed.success) return invalid();
      const tariff = { ...parsed.data, id: `demo-${parsed.data.validFrom}` };
      demo.tariffs = [
        ...demo.tariffs.filter((item) => item.validFrom !== tariff.validFrom),
        tariff,
      ].sort((a, b) => a.validFrom.localeCompare(b.validFrom));
      return json({ tariff }, 201);
    }
    case 'GET /v1/quality': {
      const low = numberParam(url, 'low');
      const high = numberParam(url, 'high');
      if (!range || low === null || high === null) return invalid();
      return json(quality(demo, from, to, low, high));
    }
    case 'PUT /v1/quality/zone': {
      const zone = (body as { zone?: unknown } | undefined)?.zone;
      if (zone !== null && zone !== 'A' && zone !== 'B' && zone !== 'C') return invalid();
      demo.zone = zone;
      return empty();
    }
    case 'GET /v1/outages':
      if (from === null || to === null) return invalid();
      return json({
        outages: boots(demo).filter((boot) => boot.bootAt >= from && boot.bootAt < to),
      });
    case 'GET /v1/power':
      return range ? json(power(data, from, to)) : invalid();
    case 'GET /v1/power/peaks': {
      const threshold = numberParam(url, 'threshold');
      if (!range || threshold === null || url.searchParams.get('meter') !== METER) {
        return invalid();
      }
      return peaks(data, from, to, threshold);
    }
  }

  if (method === 'DELETE' && url.pathname.startsWith('/v1/tariffs/')) {
    const id = decodeURIComponent(url.pathname.slice('/v1/tariffs/'.length));
    demo.tariffs = demo.tariffs.filter((tariff) => tariff.id !== id);
    return empty();
  }
  const outage = /^\/v1\/outages\/[^/]+\/(\d+)$/.exec(url.pathname);
  if (method === 'PUT' && outage) {
    const excluded = (body as { excluded?: unknown } | undefined)?.excluded;
    if (typeof excluded !== 'boolean') return invalid();
    const bootAt = Number(outage[1]);
    if (excluded) demo.excluded.add(bootAt);
    else demo.excluded.delete(bootAt);
    return empty();
  }
  // The account, the household's name and the devices stay as they are.
  return readOnly();
}
