// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * ERSE time-of-use periods for BTN in mainland Portugal (docs/time-cycles.md).
 * The maps are data (src/data/time-cycles.json): one map per cycle with peak,
 * full and empty hours, in Lisbon legal time; bi-hourly derives from it
 * (off-empty = peak + full). Every boundary is a multiple of 15 minutes, so a
 * quarter hour is classified by its start.
 */
import { z } from 'zod';
import raw from '../data/time-cycles.json';
import {
  HOUR,
  QUARTER_HOUR,
  lisbonDayLength,
  lisbonOffset,
  lisbonParts,
  startOfLisbonDay,
  type EpochSeconds,
  type LocalDate,
} from '../lib/time';
import type { BillingPeriod, Cycle, MeterPeriod, PeriodsMap, TariffOption } from './tariff';

const TIME = /^([01]\d|2[0-3]):(00|15|30|45)$/;

const segmentsSchema = z
  .array(z.tuple([z.string().regex(TIME), z.enum(['empty', 'full', 'peak'])]))
  .min(1)
  .refine((segments) => segments[0]?.[0] === '00:00', 'A day starts at 00:00')
  .transform((segments) =>
    segments.map(([time, period]) => {
      const [hours = 0, minutes = 0] = time.split(':').map(Number);
      return { from: hours * 60 + minutes, period };
    }),
  )
  .refine(
    (segments) => segments.every((s, i) => i === 0 || s.from > (segments[i - 1]?.from ?? 0)),
    'Segments in order',
  );
type Segments = z.infer<typeof segmentsSchema>;

const seasonsSchema = <T extends z.ZodType>(day: T) => z.object({ winter: day, summer: day });

const mapSchema = z.object({
  daily: seasonsSchema(segmentsSchema),
  weekly: seasonsSchema(
    z.object({ weekday: segmentsSchema, saturday: segmentsSchema, sunday: segmentsSchema }),
  ),
});

const fileSchema = z.object({
  schemaVersion: z.literal(1),
  region: z.literal('continente'),
  maps: z.object({ 'pre-2027': mapSchema, '2027': mapSchema }),
});

const MAPS = fileSchema.parse(raw).maps;

function periodIn(segments: Segments, minuteOfDay: number): MeterPeriod {
  let period = segments[0]?.period ?? 'empty';
  for (const segment of segments) {
    if (segment.from > minuteOfDay) break;
    period = segment.period;
  }
  return period;
}

/** Peak, full or empty at an instant, by Lisbon legal time (summer = DST). */
export function meterPeriod(ts: EpochSeconds, cycle: Cycle, map: PeriodsMap): MeterPeriod {
  const { hour, minute, weekday } = lisbonParts(ts);
  const season = lisbonOffset(ts) === HOUR ? 'summer' : 'winter';
  const maps = MAPS[map];
  const segments =
    cycle === 'daily'
      ? maps.daily[season]
      : maps.weekly[season][weekday === 0 ? 'sunday' : weekday === 6 ? 'saturday' : 'weekday'];
  return periodIn(segments, hour * 60 + minute);
}

/** The tariff period whose price applies at an instant. */
export function billingPeriod(
  ts: EpochSeconds,
  option: TariffOption,
  cycle: Cycle,
  map: PeriodsMap,
): BillingPeriod {
  if (option === 'simple') return 'simple';
  const period = meterPeriod(ts, cycle, map);
  if (option === 'tri') return period;
  return period === 'empty' ? 'empty' : 'offEmpty';
}

/**
 * The billing period of every quarter hour of a Lisbon day, in time order
 * (92, 96 or 100 quarters). Same result as billingPeriod for each quarter,
 * with two time-zone lookups per day instead of two per quarter.
 */
export function dayBillingPeriods(
  date: LocalDate,
  option: TariffOption,
  cycle: Cycle,
  map: PeriodsMap,
): BillingPeriod[] {
  const start = startOfLisbonDay(date);
  const count = lisbonDayLength(date) / QUARTER_HOUR;
  if (option === 'simple') return new Array<BillingPeriod>(count).fill('simple');
  // The days the clocks change: quarter by quarter.
  if (count !== 96) {
    return Array.from({ length: count }, (_, index) =>
      billingPeriod(start + index * QUARTER_HOUR, option, cycle, map),
    );
  }
  const { weekday } = lisbonParts(start);
  const season = lisbonOffset(start) === HOUR ? 'summer' : 'winter';
  const segments =
    cycle === 'daily'
      ? MAPS[map].daily[season]
      : MAPS[map].weekly[season][weekday === 0 ? 'sunday' : weekday === 6 ? 'saturday' : 'weekday'];
  return Array.from({ length: count }, (_, index) => {
    const period = periodIn(segments, index * 15);
    if (option === 'tri') return period;
    return period === 'empty' ? 'empty' : 'offEmpty';
  });
}
