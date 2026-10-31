// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The API of the demonstration mode, answered in the browser from the
 * fictional household (model.ts): the same routes and response shapes as
 * server/src/app.ts, so the pages and src/app/api.ts work unchanged. Nothing is
 * sent to the server. Changes (tariff, zone, locality, outages not counted) live in
 * memory until the demonstration ends; the account and devices cannot change
 * (409 {error: 'demo'}).
 * The E-Redes "import" is the Shelly's quarter hours up to EREDES_LAG_DAYS ago,
 * as when the last file was downloaded a few days back, 2 % lower (a Shelly
 * reads a little differently from the grid meter).
 */
import { z } from 'zod';
import { addDays } from '../domain/consumption';
import { budgetSchema, type Budget } from '../domain/budget';
import { installationSchema, type Installation } from '../domain/installation';
import { tariffInputSchema, type Tariff } from '../domain/tariff';
import { encodeSeconds, READINGS_1S_BYTES } from '../lib/readings-1s';
import { lisbonDate, lisbonToday, nextDate, startOfLisbonDay, startOfMadridDay } from '../lib/time';
import { DEMO_DAYS, generateDemo, type DemoData } from './model';
import { dailyEnergy, empty, energyRecords, invalid, json } from './responses';

const MINUTE = 60;
const DAY = 86_400;
const DEVICE_ID = 'demo-shelly';
const METER = `${DEVICE_ID}:0`;
const EREDES_LAG_DAYS = 3;
const TOP_QUARTERS = 10;
const MAX_PEAK_MINUTES = 1440;
const PEAK_RECORD_BYTES = 4 + 4 + 4 + 1 + READINGS_1S_BYTES;

export const DEMO_ME = {
  email: 'demonstracao@wattometro',
  householdId: 'demo',
  householdName: 'Casa de exemplo',
  admin: false,
};

interface DemoState {
  data: DemoData;
  tariffs: Tariff[];
  zone: 'A' | 'B' | 'C' | null;
  location: DemoLocation | null;
  installation: Installation;
  budget: Budget | null;
  excluded: Set<number>;
  signatures: DemoSignature[];
  appliances: DemoAppliance[];
  /** PUT /v1/nilm/days, by day (the browser's own encoding). */
  nilmDays: Map<string, { day: string; version: number; minutes: number; data: string }>;
}

interface DemoAppliance {
  id: string;
  label: string;
  powerW: number;
  statesW: number[];
  pulsing: boolean;
  minDurationS: number | null;
  maxDurationS: number | null;
  heats: number | null;
  createdAt: number;
}

/** A descriptor as the server accepts it (server/src/app.ts, ApplianceBody). */
function applianceInput(value: unknown): Omit<DemoAppliance, 'id' | 'createdAt'> | null {
  if (typeof value !== 'object' || value === null) return null;
  const { label, powerW, statesW, pulsing, minDurationS, maxDurationS, heats } = value as Record<
    string,
    unknown
  >;
  const name = typeof label === 'string' ? label.trim() : '';
  if (name === '' || name.length > 60 || !Number.isInteger(powerW) || (powerW as number) < 1) {
    return null;
  }
  if (!Array.isArray(statesW) || statesW.length === 0 || !statesW.every(Number.isInteger)) {
    return null;
  }
  if (typeof pulsing !== 'boolean') return null;
  const heatings = heats ?? null;
  if (heatings !== null && (!Number.isInteger(heatings) || (heatings as number) < 1)) return null;
  const min = minDurationS ?? null;
  const max = maxDurationS ?? null;
  if ((min === null) !== (max === null)) return null;
  if (
    min !== null &&
    (!Number.isInteger(min) || !Number.isInteger(max) || (min as number) > (max as number))
  ) {
    return null;
  }
  return {
    label: name,
    powerW: powerW as number,
    statesW: statesW as number[],
    pulsing,
    minDurationS: min as number | null,
    maxDurationS: max as number | null,
    heats: heatings as number | null,
  };
}

interface DemoSignature {
  id: string;
  label: string;
  from: number;
  to: number;
  createdAt: number;
}

interface DemoLocation {
  name: string;
  latitudeCdeg: number;
  longitudeCdeg: number;
}

const DEMO_LOCATION: DemoLocation = { name: 'Lisboa', latitudeCdeg: 3872, longitudeCdeg: -914 };

/** As src/demo/model.ts draws it: electric water heater, no heating on electricity. */
const DEMO_INSTALLATION: Installation = {
  heating: ['gas-boiler'],
  airConditioning: false,
  waterHeating: 'electric',
  hob: 'electric',
  solarPanels: false,
  electricCar: false,
};

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
    state = {
      data,
      tariffs: [demoTariff(data)],
      zone: 'B',
      location: DEMO_LOCATION,
      installation: DEMO_INSTALLATION,
      budget: null,
      excluded: new Set(),
      signatures: demoSignatures(),
      appliances: [],
      nilmDays: new Map(),
    };
  }
  return state;
}

/** One calibration already made: the dishwasher of yesterday evening (src/demo/model.ts). */
function demoSignatures(): DemoSignature[] {
  // As the model counts it: 22 h 30 after midnight (21:30 on the day the clocks go back).
  const from = startOfLisbonDay(addDays(lisbonToday(), -1)) + (22 * 60 + 30) * MINUTE;
  return [
    {
      id: 'demo-dishwasher',
      label: 'Máquina da loiça',
      from,
      to: from + 25 * MINUTE,
      createdAt: from + 30 * MINUTE,
    },
  ];
}

/** The minutes a signature keeps, as on the server: whole minutes, one more on each side. */
function signatureRange(signature: { from: number; to: number }): [number, number] {
  return [
    Math.floor(signature.from / MINUTE) * MINUTE - MINUTE,
    Math.ceil(signature.to / MINUTE) * MINUTE + MINUTE,
  ];
}

function presentMinutes(data: DemoData, from: number, to: number): number {
  const [first, last] = minuteRange(data, from, to);
  let count = 0;
  for (let index = first; index < last; index++) if (data.present[index]) count++;
  return count;
}

function signatureView(data: DemoData, signature: DemoSignature) {
  return {
    ...signature,
    meter: METER,
    minutes: presentMinutes(data, ...signatureRange(signature)),
  };
}

/** Forgets the household and its changes (when the demonstration ends). */
export function resetDemo(): void {
  state = null;
}

const readOnly = () => json({ error: 'demo' }, 409);

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
    database: {
      sizeBytes: 31_000_000,
      limitBytes: 500_000_000,
      rowsReadToday: 40_000,
      rowsReadLimit: 5_000_000,
    },
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
function meterQuarters(data: DemoData, meter: string, from: number, to: number) {
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
function secondsRecords(data: DemoData, from: number, to: number): Response {
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

function isDemoLocation(value: unknown): value is DemoLocation {
  if (typeof value !== 'object' || value === null) return false;
  const { name, latitudeCdeg, longitudeCdeg } = value as Record<string, unknown>;
  return (
    typeof name === 'string' &&
    name.trim() !== '' &&
    Number.isInteger(latitudeCdeg) &&
    Number.isInteger(longitudeCdeg)
  );
}

/**
 * Invented market prices for today and tomorrow (GET /v1/omie), € per MWh for
 * each Lisbon hour: cheap at midday (sun), dear in the evening. Not OMIE's.
 */
const DEMO_MARKET = [
  95, 90, 88, 86, 85, 88, 100, 120, 110, 80, 50, 30, 20, 18, 20, 35, 60, 110, 160, 190, 170, 140,
  120, 105,
];

function demoOmieDays() {
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

const DemoNilmBody = z.object({
  meter: z.literal(METER),
  days: z.array(
    z.object({
      day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      version: z.number().int().min(1),
      minutes: z.number().int().min(0),
      data: z.string().min(1),
    }),
  ),
});

const demoNilmDays = (body: unknown) => DemoNilmBody.safeParse(body).data?.days ?? null;

/** Answers one API request of the demonstration. */
export function demoResponse(method: string, path: string, body?: unknown): Response {
  const url = new URL(path, 'https://demo.invalid');
  const route = `${method} ${url.pathname}`;
  const demo = current();
  const { data } = demo;
  const from = numberParam(url, 'from');
  const to = numberParam(url, 'to');
  const range = from !== null && to !== null && from < to && to - from <= DEMO_DAYS * DAY;
  // "Potência" looks back a year, as the server allows; the data stops at DEMO_DAYS.
  const yearRange = from !== null && to !== null && from < to && to - from <= 366 * DAY;

  switch (route) {
    case 'GET /v1/auth/me':
      return json(DEMO_ME);
    case 'POST /v1/auth/logout':
      return empty();
    // As a server without VAPID keys: no alerts in the demonstration.
    case 'GET /v1/push/key':
    case 'GET /v1/push/subscription':
    case 'PUT /v1/push/subscription':
    case 'DELETE /v1/push/subscription':
    case 'POST /v1/push/test':
      return json({ error: 'not_configured' }, 503);
    // As a server without AI_KEY_SECRET: a key tried in the demonstration stays in this browser.
    case 'GET /v1/ai-settings':
    case 'PUT /v1/ai-settings':
    case 'DELETE /v1/ai-settings':
      return json({ error: 'not_configured' }, 503);
    case 'GET /v1/devices':
      return json({ devices: devices(data) });
    case 'GET /v1/now':
      return json(now(data));
    case 'GET /v1/energy': {
      if (from === null || to === null || from >= to) return invalid();
      return json({
        meters: ['eredes', METER].flatMap((meter) => {
          const quarters = meterQuarters(data, meter, from, to) ?? [];
          return quarters.length === 0
            ? []
            : [
                {
                  meter,
                  days: dailyEnergy(quarters).length,
                  energyWh: quarters.reduce((sum, [, wh]) => sum + wh, 0),
                },
              ];
        }),
      });
    }
    case 'GET /v1/energy/days':
    case 'GET /v1/energy/quarters': {
      const quarters =
        from === null || to === null
          ? null
          : meterQuarters(data, url.searchParams.get('meter') ?? '', from, to);
      if (!quarters) return invalid();
      return route === 'GET /v1/energy/days'
        ? json({ days: dailyEnergy(quarters, url.searchParams.get('meter') !== 'eredes') })
        : energyRecords(quarters);
    }
    case 'GET /v1/import/eredes': {
      const quarters = meterQuarters(data, 'eredes', data.start, Number.MAX_SAFE_INTEGER) ?? [];
      const days = new Map<string, number>();
      for (const [ts] of quarters) days.set(lisbonDate(ts), (days.get(lisbonDate(ts)) ?? 0) + 1);
      return json({
        quarters: quarters.length,
        estimated: 0,
        energyWh: quarters.reduce((sum, [, wh]) => sum + wh, 0),
        from: quarters[0]?.[0] ?? null,
        to: quarters.length > 0 ? (quarters.at(-1)?.[0] ?? 0) + 900 : null,
        days: [...days].map(([day, count]) => [day, count, 0]),
      });
    }
    case 'GET /v1/tariffs':
      return json({ tariffs: demo.tariffs });
    case 'GET /v1/omie':
      return json({ days: demoOmieDays() });
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
    case 'GET /v1/household/location':
      return json({ location: demo.location });
    case 'PUT /v1/household/location': {
      const location = (body as { location?: unknown } | undefined)?.location;
      if (location === null) demo.location = null;
      else if (isDemoLocation(location)) demo.location = location;
      else return invalid();
      return empty();
    }
    case 'POST /v1/visit':
      return empty();
    case 'GET /v1/household/budget':
      return json({ budget: demo.budget });
    case 'PUT /v1/household/budget': {
      const parsed = budgetSchema
        .nullable()
        .safeParse((body as { budget?: unknown } | undefined)?.budget);
      if (!parsed.success) return invalid();
      demo.budget = parsed.data;
      return empty();
    }
    case 'GET /v1/household/installation':
      return json({ installation: demo.installation });
    case 'PUT /v1/household/installation': {
      const parsed = installationSchema.safeParse(
        (body as { installation?: unknown } | undefined)?.installation,
      );
      if (!parsed.success) return invalid();
      demo.installation = parsed.data;
      return empty();
    }
    case 'GET /v1/outages':
      if (from === null || to === null) return invalid();
      return json({
        outages: boots(demo).filter((boot) => boot.bootAt >= from && boot.bootAt < to),
      });
    case 'GET /v1/power':
      return yearRange ? json(power(data, from, to)) : invalid();
    case 'GET /v1/seconds':
      if (!range || to - from > 25 * 3600 || url.searchParams.get('meter') !== METER) {
        return invalid();
      }
      return secondsRecords(data, from, to);
    case 'GET /v1/signatures':
      return json({
        signatures: [...demo.signatures]
          .sort((a, b) => b.from - a.from)
          .map((signature) => signatureView(data, signature)),
      });
    case 'POST /v1/signatures': {
      const input = body as Partial<Record<'meter' | 'label' | 'from' | 'to', unknown>> | undefined;
      const label = typeof input?.label === 'string' ? input.label.trim() : '';
      const { from: start, to: end } = input ?? {};
      if (
        input?.meter !== METER ||
        label === '' ||
        label.length > 60 ||
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        (start as number) >= (end as number) ||
        (end as number) - (start as number) > 4 * 3600
      ) {
        return invalid();
      }
      const signature: DemoSignature = {
        id: `demo-${demo.signatures.length + 1}-${start as number}`,
        label,
        from: start as number,
        to: end as number,
        createdAt: Math.floor(Date.now() / 1000),
      };
      const view = signatureView(data, signature);
      if (view.minutes === 0) return invalid();
      demo.signatures.push(signature);
      return json({ signature: view }, 201);
    }
    case 'GET /v1/nilm/days': {
      const first = url.searchParams.get('from') ?? '';
      const last = url.searchParams.get('to') ?? '';
      if (url.searchParams.get('meter') !== METER) return invalid();
      return json({
        days: [...demo.nilmDays.values()]
          .filter((item) => item.day >= first && item.day <= last)
          .sort((a, b) => a.day.localeCompare(b.day)),
      });
    }
    case 'PUT /v1/nilm/days': {
      const days = demoNilmDays(body);
      if (!days) return invalid();
      for (const item of days) demo.nilmDays.set(item.day, item);
      return empty();
    }
    case 'GET /v1/appliances':
      return json({
        appliances: [...demo.appliances].sort((a, b) => a.label.localeCompare(b.label, 'pt')),
      });
    case 'POST /v1/appliances': {
      const input = applianceInput(body);
      if (!input) return invalid();
      const appliance = {
        id: `demo-appliance-${demo.appliances.length + 1}-${Date.now()}`,
        ...input,
        createdAt: Math.floor(Date.now() / 1000),
      };
      demo.appliances.push(appliance);
      return json({ appliance }, 201);
    }
    case 'GET /v1/power/peaks': {
      const threshold = numberParam(url, 'threshold');
      if (!yearRange || threshold === null || url.searchParams.get('meter') !== METER) {
        return invalid();
      }
      return peaks(data, from, to, threshold);
    }
  }

  const appliance = /^\/v1\/appliances\/([^/]+)$/.exec(url.pathname);
  if (appliance) {
    const id = decodeURIComponent(appliance[1] as string);
    const found = demo.appliances.find((item) => item.id === id);
    if (method === 'PATCH') {
      const { label, durations } = (body ?? {}) as { label?: unknown; durations?: unknown };
      const name = typeof label === 'string' ? label.trim() : null;
      const range = durations as { minS?: unknown; maxS?: unknown } | undefined;
      if (name === null && range === undefined) return invalid();
      if (name !== null && (name === '' || name.length > 60)) return invalid();
      if (
        range !== undefined &&
        (!Number.isInteger(range.minS) ||
          !Number.isInteger(range.maxS) ||
          (range.minS as number) > (range.maxS as number))
      ) {
        return invalid();
      }
      if (!found) return json({ error: 'not_found' }, 404);
      if (name !== null) found.label = name;
      if (range !== undefined) {
        found.minDurationS = range.minS as number;
        found.maxDurationS = range.maxS as number;
      }
      return empty();
    }
    if (method === 'DELETE') {
      demo.appliances = demo.appliances.filter((item) => item.id !== id);
      return empty();
    }
  }

  const signature = /^\/v1\/signatures\/([^/]+)(\/seconds)?$/.exec(url.pathname);
  if (signature) {
    const id = decodeURIComponent(signature[1] as string);
    const found = demo.signatures.find((item) => item.id === id);
    if (method === 'GET' && signature[2]) {
      return found
        ? secondsRecords(data, ...signatureRange(found))
        : json({ error: 'not_found' }, 404);
    }
    if (method === 'DELETE' && !signature[2]) {
      demo.signatures = demo.signatures.filter((item) => item.id !== id);
      return empty();
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
