// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A day's analysis as kept on the server (Phase 8.1, nilm_days): its cycles,
 * energy and quarter hours, without the names (the appliances are matched on
 * top, as they are named). Kept past the per-second values (90 days), so the
 * appliances keep their history; shared between the household's devices.
 *
 * Encoding: compact JSON (each event and cycle a tuple), gzip-compressed in the
 * browser (CompressionStream), base64url for the API. Read back with zod: the
 * server only stores the bytes.
 *
 * NILM_VERSION goes up whenever the detection changes what it finds
 * (events.ts, cycles.ts, periodic.ts, programmes.ts…): a stored day of an
 * older version is worked out again while its per-second values exist, and
 * "Reprocessar" redoes the last 90 days.
 */
import { z } from 'zod';
import { fromBase64Url, toBase64Url } from '../lib/base64url';
import type { EpochSeconds, LocalDate } from '../lib/time';
import type { Wh } from '../lib/units';
import type { Cycle } from './cycles';
import type { DayAnalysis } from './day';
import type { PowerEvent } from './events';
import { groupCycles } from './summary';

export const NILM_VERSION = 1;

/** What the server keeps of a day (and what the appliances need of it). */
export type StoredDay = Pick<DayAnalysis, 'day' | 'minutes' | 'cycles' | 'energyWh' | 'quarters'>;

const num = z.number().finite();
const EventTuple = z.tuple([
  num,
  num,
  num,
  num,
  num,
  num,
  num,
  num,
  z.union([z.literal(0), z.literal(1)]),
  num,
]);
const Pair = z.tuple([num, num]);
const CycleTuple = z.tuple([
  EventTuple,
  EventTuple,
  num,
  num,
  num,
  num,
  num,
  num,
  num,
  z.array(Pair),
  z.union([Pair, z.literal(0)]),
  z.union([Pair, z.literal(0)]),
]);
const Encoded = z.object({
  v: z.number().int(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  minutes: z.number().int().min(0),
  energyWh: num,
  quarters: z.array(Pair),
  cycles: z.array(CycleTuple),
});

type EventTupleT = z.infer<typeof EventTuple>;

const eventTuple = (event: PowerEvent): EventTupleT => [
  event.ts,
  event.deltaW,
  event.deltaW230,
  event.deltaVar,
  event.beforeW,
  event.afterW,
  event.overshootW,
  event.transientS,
  event.ramp ? 1 : 0,
  event.afterStdW,
];

const eventOf = (tuple: EventTupleT): PowerEvent => ({
  ts: tuple[0],
  deltaW: tuple[1],
  deltaW230: tuple[2],
  deltaVar: tuple[3],
  beforeW: tuple[4],
  afterW: tuple[5],
  overshootW: tuple[6],
  transientS: tuple[7],
  ramp: tuple[8] === 1,
  afterStdW: tuple[9],
});

const pairOf = (value: { count: number; onS: number } | undefined) =>
  value ? ([value.count, value.onS] as [number, number]) : (0 as const);

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const piped = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(piped).arrayBuffer());
}

/** The day, compressed, as base64url for PUT /v1/nilm/days. */
export async function encodeDay(day: StoredDay): Promise<string> {
  const json = JSON.stringify({
    v: NILM_VERSION,
    day: day.day,
    minutes: day.minutes,
    energyWh: day.energyWh,
    quarters: day.quarters.map((quarter) => [quarter.ts, quarter.energyWh]),
    cycles: day.cycles.map((cycle) => [
      eventTuple(cycle.on),
      eventTuple(cycle.off),
      cycle.start,
      cycle.end,
      cycle.durationS,
      cycle.powerW,
      cycle.powerW230,
      cycle.nonActiveVar,
      cycle.energyWh,
      cycle.states.map((state) => [state.from, state.powerW]),
      pairOf(cycle.pulses),
      pairOf(cycle.heats),
    ]),
  });
  const gzipped = await pipe(new TextEncoder().encode(json), new CompressionStream('gzip'));
  return toBase64Url(gzipped);
}

/** A stored day back, or null when it cannot be read (or is of another version). */
export async function decodeDay(data: string): Promise<StoredDay | null> {
  try {
    const json = await pipe(fromBase64Url(data), new DecompressionStream('gzip'));
    const parsed = Encoded.safeParse(JSON.parse(new TextDecoder().decode(json)));
    if (!parsed.success || parsed.data.v !== NILM_VERSION) return null;
    const { day, minutes, energyWh, quarters, cycles } = parsed.data;
    return {
      day: day as LocalDate,
      minutes,
      energyWh: energyWh as Wh,
      quarters: quarters.map(([ts, wh]) => ({ ts: ts as EpochSeconds, energyWh: wh })),
      cycles: cycles.map((tuple): Cycle => {
        const [on, off, start, end, durationS, powerW, powerW230, nonActiveVar, energy] = tuple;
        const cycle: Cycle = {
          on: eventOf(on),
          off: eventOf(off),
          start,
          end,
          durationS,
          powerW,
          powerW230,
          nonActiveVar,
          energyWh: energy,
          states: tuple[9].map(([from, watts]) => ({ from, powerW: watts })),
        };
        if (tuple[10] !== 0) cycle.pulses = { count: tuple[10][0], onS: tuple[10][1] };
        if (tuple[11] !== 0) cycle.heats = { count: tuple[11][0], onS: tuple[11][1] };
        return cycle;
      }),
    };
  } catch {
    return null;
  }
}

/** A stored day as the analysis the app works with (without the loose events). */
export function analysisOf(stored: StoredDay): DayAnalysis {
  return { ...stored, events: [], groups: groupCycles(stored.cycles) };
}
