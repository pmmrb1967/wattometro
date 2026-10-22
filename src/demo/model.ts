// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A fictional household for the demonstration mode: appliances switching on and
 * off on a deterministic schedule (the same data on every visit for the same
 * day), per second, for the last DEMO_DAYS days. Nothing here is real data.
 *
 * Scenario shown by the pages:
 * - contracted power 10,35 kVA, but one evening (oven + induction hob + kettle,
 *   3 minutes) is the only time it goes near 6,9 kVA: 6,9 kVA would not have
 *   tripped, 5,75 kVA would;
 * - a long outage (47 min) and a short one (90 s);
 * - an undervoltage episode (25 min near 203 V) and a one-minute overvoltage.
 */
import {
  lisbonDate,
  lisbonParts,
  nextDate,
  startOfLisbonDay,
  type EpochSeconds,
} from '../lib/time';

export const DEMO_DAYS = 92;
const MINUTE = 60;
const DAY = 86_400;

interface Load {
  start: EpochSeconds;
  end: EpochSeconds;
  /** Active power, W, and non-active power, var. */
  p: number;
  q: number;
}

/** Deterministic pseudo-random numbers (mulberry32). */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let x = state;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Small deterministic noise for a second, in [−range, range]. */
function noise(ts: number, range: number): number {
  let x = Math.imul(ts ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return ((x >>> 0) % (2 * range + 1)) - range;
}

export interface DemoEvents {
  /** The evening of the highest peak (start of the 3 minutes). */
  peakAt: EpochSeconds;
  outages: { start: EpochSeconds; end: EpochSeconds }[];
  /** Undervoltage episode and overvoltage minute. */
  lowVoltage: { start: EpochSeconds; end: EpochSeconds };
  highVoltageMinute: EpochSeconds;
  /** The Shelly's first boot, before the data starts. */
  firstBoot: EpochSeconds;
}

const at = (dayStart: EpochSeconds, hour: number, minute: number) =>
  dayStart + (hour * 60 + minute) * MINUTE;

export function demoEvents(now: EpochSeconds): DemoEvents {
  const dayStart = (daysAgo: number) => startOfLisbonDay(lisbonDate(now - daysAgo * DAY));
  return {
    peakAt: at(dayStart(9), 20, 5),
    outages: [
      { start: at(dayStart(20), 3, 12) + 25, end: at(dayStart(20), 3, 59) + 40 },
      { start: at(dayStart(6), 16, 40) + 10, end: at(dayStart(6), 16, 41) + 40 },
    ],
    lowVoltage: { start: at(dayStart(5), 18, 10), end: at(dayStart(5), 18, 35) },
    highVoltageMinute: at(dayStart(12), 14, 2),
    firstBoot: dayStart(DEMO_DAYS) - DAY,
  };
}

/** The appliances of one Lisbon day. */
function dayLoads(date: string, events: DemoEvents): Load[] {
  const dayStart = startOfLisbonDay(date);
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const rand = random(year * 10_000 + month * 100 + day);
  const weekday = lisbonParts(dayStart + 12 * 3600).weekday;
  const weekend = weekday === 0 || weekday === 6;
  const loads: Load[] = [];
  const add = (start: EpochSeconds, minutes: number, p: number, q: number) =>
    loads.push({ start, end: start + Math.round(minutes * MINUTE), p, q });

  // Fridge compressor: 18 min every 50 min.
  const offset = Math.floor(rand() * 50);
  for (let minute = offset - 50; minute < 24 * 60; minute += 50) {
    add(dayStart + minute * MINUTE, 18, 110, 70);
  }
  // Water heater in the empty period, kettle in the morning.
  add(at(dayStart, 2, Math.floor(rand() * 20)), 70 + rand() * 30, 1800, 0);
  add(at(dayStart, 7, 30 + Math.floor(rand() * 15)), 2.5, 2000, 0);
  // TV and computer in the evening.
  add(at(dayStart, 18, 0), 330, 150, 40);
  // Lunch at home at the weekend.
  if (weekend) add(at(dayStart, 12, 45), 25, 2600, 500);
  // Dinner: oven some days, then the induction hob (that evening: the peak below instead).
  const peakDay = lisbonDate(events.peakAt) === date;
  const oven = rand() < 0.4;
  const hobAt = 50 + Math.floor(rand() * 10);
  if (!peakDay && oven) add(at(dayStart, 19, 0), 40, 2400, 0);
  if (!peakDay) add(at(dayStart, 19, hobAt), 25, 2600, 500);
  if (rand() < 0.5) add(at(dayStart, 21, 30), 3, 2000, 0);
  // Dishwasher heating; washing machine on Saturdays (heating, then the motor).
  add(at(dayStart, 22, 30), 25, 1900, 100);
  if (weekday === 6) {
    add(at(dayStart, 10, 0), 20, 2000, 100);
    add(at(dayStart, 10, 20), 60, 400, 300);
  }
  // The evening of the highest peak: oven, hob on boost and the kettle together.
  if (peakDay) {
    add(events.peakAt - 20 * MINUTE, 30, 2400, 0);
    add(events.peakAt - 2 * MINUTE, 6, 3600, 700);
    add(events.peakAt, 3, 2000, 0);
  }
  return loads;
}

const BASE_P = 160;
const BASE_Q = 60;

/** Voltage (dV) at a second: lower in the evening and under load; the episodes. */
function voltageAt(ts: EpochSeconds, hour: number, p: number, events: DemoEvents): number {
  if (ts >= events.lowVoltage.start && ts < events.lowVoltage.end) {
    return 2030 + noise(ts, 12);
  }
  if (ts >= events.highVoltageMinute && ts < events.highVoltageMinute + MINUTE) {
    return 2520 + noise(ts, 25);
  }
  const evening = hour >= 18 && hour < 22 ? 35 : hour >= 8 && hour < 18 ? 12 : 0;
  return 2325 - evening - Math.round((p * 6) / 1000) + noise(ts, 8);
}

export interface DemoSeconds {
  power: (number | null)[];
  nonActive: (number | null)[];
  voltage: (number | null)[];
}

/** Columnar minutes of the whole period (typed arrays: a few MB, generated once). */
export interface DemoData {
  now: EpochSeconds;
  /** Start of the first minute; minute i starts at start + 60 i. */
  start: EpochSeconds;
  count: number;
  /** 0 during an outage (no data). */
  present: Uint8Array;
  energyWh: Int32Array;
  powerAvgW: Int32Array;
  powerMinW: Int32Array;
  powerMaxW: Int32Array;
  apparentMaxVa: Int32Array;
  voltageMinDv: Int32Array;
  voltageAvgDv: Int32Array;
  voltageMaxDv: Int32Array;
  pfAvgPct: Int32Array;
  events: DemoEvents;
  /** The per-second values of minute i. */
  seconds: (index: number) => DemoSeconds;
}

export function generateDemo(nowInput: EpochSeconds): DemoData {
  const now = nowInput - (nowInput % MINUTE);
  const events = demoEvents(now);
  const firstDate = lisbonDate(now - DEMO_DAYS * DAY);
  const start = startOfLisbonDay(firstDate);
  const count = (now - start) / MINUTE;

  // Days in order; a minute finds its day by binary search (no date formatting per minute).
  const days: { start: EpochSeconds; loads: Load[] }[] = [];
  for (let date = firstDate; startOfLisbonDay(date) <= now; date = nextDate(date)) {
    days.push({ start: startOfLisbonDay(date), loads: dayLoads(date, events) });
  }
  const dayIndex = (ts: EpochSeconds) => {
    let low = 0;
    let high = days.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if ((days[middle] as { start: number }).start <= ts) low = middle;
      else high = middle - 1;
    }
    return low;
  };
  const inOutage = (ts: EpochSeconds) =>
    events.outages.some((outage) => ts + MINUTE > outage.start && ts < outage.end);

  /** Loads that touch [ts, ts + 60): the day's and the day before's (a load across midnight). */
  const minuteLoads = (ts: EpochSeconds, index: number): Load[] => {
    const all = [...(days[index - 1]?.loads ?? []), ...(days[index]?.loads ?? [])];
    return all.filter((load) => load.start < ts + MINUTE && load.end > ts);
  };

  const seconds = (index: number): DemoSeconds => {
    const ts = start + index * MINUTE;
    const day = dayIndex(ts);
    const loads = minuteLoads(ts, day);
    // Local hour; off by one on the two days the clocks change, which does not matter here.
    const hour = Math.floor((ts - (days[day] as { start: number }).start) / 3600);
    const power: number[] = [];
    const nonActive: number[] = [];
    const voltage: number[] = [];
    for (let second = 0; second < MINUTE; second++) {
      const instant = ts + second;
      let p = BASE_P + noise(instant, 6);
      let q = BASE_Q;
      for (const load of loads) {
        if (instant >= load.start && instant < load.end) {
          p += load.p;
          q += load.q;
        }
      }
      power.push(p);
      nonActive.push(q);
      voltage.push(voltageAt(instant, hour, p, events));
    }
    return { power, nonActive, voltage };
  };

  const data: DemoData = {
    now,
    start,
    count,
    present: new Uint8Array(count),
    energyWh: new Int32Array(count),
    powerAvgW: new Int32Array(count),
    powerMinW: new Int32Array(count),
    powerMaxW: new Int32Array(count),
    apparentMaxVa: new Int32Array(count),
    voltageMinDv: new Int32Array(count),
    voltageAvgDv: new Int32Array(count),
    voltageMaxDv: new Int32Array(count),
    pfAvgPct: new Int32Array(count),
    events,
    seconds,
  };

  // Energy as a running counter, so the minutes add up exactly (as the Shelly script does).
  let counterWs = 0;
  let counterWh = 0;
  for (let index = 0; index < count; index++) {
    const ts = start + index * MINUTE;
    const { power, nonActive, voltage } = seconds(index);
    let sumP = 0;
    let sumS = 0;
    let minP = Infinity;
    let maxP = -Infinity;
    let maxS = 0;
    let sumV = 0;
    let minV = Infinity;
    let maxV = -Infinity;
    for (let second = 0; second < MINUTE; second++) {
      const p = power[second] as number;
      const q = nonActive[second] as number;
      const v = voltage[second] as number;
      const s = Math.round(Math.hypot(p, q));
      sumP += p;
      sumS += s;
      minP = Math.min(minP, p);
      maxP = Math.max(maxP, p);
      maxS = Math.max(maxS, s);
      sumV += v;
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
    // Nothing is consumed nor measured during an outage.
    if (inOutage(ts)) continue;
    counterWs += sumP;
    const wh = Math.floor(counterWs / 3600);
    data.present[index] = 1;
    data.energyWh[index] = wh - counterWh;
    counterWh = wh;
    data.powerAvgW[index] = Math.round(sumP / MINUTE);
    data.powerMinW[index] = minP;
    data.powerMaxW[index] = maxP;
    data.apparentMaxVa[index] = maxS;
    data.voltageMinDv[index] = minV;
    data.voltageAvgDv[index] = Math.round(sumV / MINUTE);
    data.voltageMaxDv[index] = maxV;
    data.pfAvgPct[index] = Math.round((sumP * 100) / sumS);
  }
  return data;
}
