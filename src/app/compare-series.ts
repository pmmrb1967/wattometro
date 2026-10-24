// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * "Consumo" with the house chosen: E-Redes and the Shelly side by side, per
 * quarter hour (a day) or per day (a week, a month), and how far apart they are
 * where both have data: the quarters both have, or the days both have whole.
 * Energy stays in integer Wh; only the share is a ratio.
 */
import {
  formatLisbonTime,
  nextDate,
  startOfLisbonDay,
  type EpochSeconds,
  type LocalDate,
} from '../lib/time';

type Quarter = { ts: EpochSeconds; energyWh: number };
const QUARTER = 900;

export interface ComparedSlot {
  key: string;
  /** Start of the quarter hour (a day) or the date (a week, a month). */
  at: EpochSeconds | LocalDate;
  eredes: number | null;
  shelly: number | null;
}

export interface Comparison {
  slots: ComparedSlot[];
  /** Energy of each system over the slots shown, Wh. */
  totals: { eredes: number; shelly: number };
  /** Where both have data: how many slots and the energy of each over them, Wh. */
  common: { count: number; eredesWh: number; shellyWh: number };
}

/** The quarter hours of a Lisbon day: 92, 96 or 100 (23 h, 24 h, 25 h). */
export function daySlots(date: LocalDate): EpochSeconds[] {
  const slots: EpochSeconds[] = [];
  const end = startOfLisbonDay(nextDate(date));
  for (let ts = startOfLisbonDay(date); ts < end; ts += QUARTER) slots.push(ts);
  return slots;
}

/** Axis labels every 3 hours of local time ("0 h", "3 h" … "21 h"). */
export function hourTicks(slots: readonly EpochSeconds[]): { index: number; label: string }[] {
  return slots.flatMap((ts, index) => {
    const time = formatLisbonTime(ts);
    const hour = Number(time.slice(0, 2));
    return time.endsWith(':00') && hour % 3 === 0 ? [{ index, label: `${hour} h` }] : [];
  });
}

function byTs(quarters: readonly Quarter[], from: EpochSeconds, to: EpochSeconds) {
  const map = new Map<EpochSeconds, number>();
  for (const { ts, energyWh } of quarters) if (ts >= from && ts < to) map.set(ts, energyWh);
  return map;
}

export function compareSeries(
  eredes: readonly Quarter[],
  shelly: readonly Quarter[],
  view: 'day' | 'days',
  dates: readonly LocalDate[],
): Comparison {
  const first = dates[0] as LocalDate;
  const from = startOfLisbonDay(first);
  const to = startOfLisbonDay(nextDate(dates.at(-1) as LocalDate));
  const e = byTs(eredes, from, to);
  const s = byTs(shelly, from, to);
  const totals = { eredes: 0, shelly: 0 };
  const common = { count: 0, eredesWh: 0, shellyWh: 0 };

  if (view === 'day') {
    const slots = daySlots(first).map((ts) => {
      const slot = {
        key: String(ts),
        at: ts,
        eredes: e.get(ts) ?? null,
        shelly: s.get(ts) ?? null,
      };
      totals.eredes += slot.eredes ?? 0;
      totals.shelly += slot.shelly ?? 0;
      if (slot.eredes !== null && slot.shelly !== null) {
        common.count += 1;
        common.eredesWh += slot.eredes;
        common.shellyWh += slot.shelly;
      }
      return slot;
    });
    return { slots, totals, common };
  }

  const sum = (map: Map<EpochSeconds, number>, date: LocalDate) => {
    let wh = 0;
    let count = 0;
    for (const ts of daySlots(date)) {
      const value = map.get(ts);
      if (value === undefined) continue;
      wh += value;
      count += 1;
    }
    return { wh, count };
  };
  const slots = dates.map((date) => {
    const whole = daySlots(date).length;
    const ofE = sum(e, date);
    const ofS = sum(s, date);
    totals.eredes += ofE.wh;
    totals.shelly += ofS.wh;
    if (ofE.count === whole && ofS.count === whole) {
      common.count += 1;
      common.eredesWh += ofE.wh;
      common.shellyWh += ofS.wh;
    }
    return {
      key: date,
      at: date,
      eredes: ofE.count > 0 ? ofE.wh : null,
      shelly: ofS.count > 0 ? ofS.wh : null,
    };
  });
  return { slots, totals, common };
}

/**
 * How much more (1) or less (−1) the Shelly measures than E-Redes, as a
 * percentage with one decimal ("2,1 %"); null without both.
 */
export function differencePct(
  common: Comparison['common'],
): { direction: 1 | 0 | -1; pct: string } | null {
  if (common.count === 0 || common.eredesWh === 0) return null;
  const tenths = Math.round(((common.shellyWh - common.eredesWh) * 1000) / common.eredesWh);
  const text = new Intl.NumberFormat('pt-PT', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Math.abs(tenths) / 10);
  return { direction: tenths > 0 ? 1 : tenths < 0 ? -1 : 0, pct: `${text} %` };
}
