// SPDX-License-Identifier: AGPL-3.0-or-later
/** Bars of daily energy for the charts of "Consumo" and the monthly report. */
import type { Bar } from '../components/Charts';
import { weekdayOf, type DayTotal } from '../domain/consumption';
import type { BillingPeriod } from '../domain/tariff';
import { t } from '../i18n/pt-PT';
import type { LocalDate } from '../lib/time';
import { formatKwh } from '../lib/units';

const texts = t.consumption.charts;
/** Bottom to top. */
const ORDER: BillingPeriod[] = ['empty', 'offEmpty', 'full', 'peak', 'simple'];
/** Fewer quarters than this: an incomplete day. */
const FULL_DAY_QUARTERS = 92;
export const noon = (date: LocalDate) => new Date(`${date}T12:00:00Z`);
/** E.g. "23/10". */
export const SHORT_DAY = new Intl.DateTimeFormat('pt-PT', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const kwh = (wh: number) => formatKwh(wh, 2);

function segments(byPeriod: Partial<Record<BillingPeriod, number>>) {
  return ORDER.filter((period) => (byPeriod[period] ?? 0) > 0).map((period) => ({
    period,
    value: byPeriod[period] ?? 0,
  }));
}

/** One bar per day (stacked by period) and the axis labels: weekdays, or days 1, 8, 15… */
export function dayBars(
  dates: readonly LocalDate[],
  totals: ReadonlyMap<LocalDate, DayTotal>,
  labels: 'week' | 'month',
): { bars: Bar[]; ticks: { index: number; label: string }[] } {
  const bars = dates.map((day) => {
    const dayTotalOf = totals.get(day);
    return {
      key: day,
      title: texts.dayTitle(
        SHORT_DAY.format(noon(day)),
        dayTotalOf ? kwh(dayTotalOf.totalWh) : texts.noData,
      ),
      segments: segments(dayTotalOf?.byPeriod ?? {}),
      partial: !dayTotalOf || dayTotalOf.quarters < FULL_DAY_QUARTERS,
    };
  });
  const ticks = dates.flatMap((day, index) =>
    labels === 'week'
      ? [{ index, label: texts.weekdays[weekdayOf(day)] ?? '' }]
      : [1, 8, 15, 22, 29].includes(Number(day.slice(8)))
        ? [{ index, label: String(Number(day.slice(8))) }]
        : [],
  );
  return { bars, ticks };
}

/** Periods with energy, bottom to top. */
export function usedPeriods(byPeriod: Partial<Record<BillingPeriod, number>>): BillingPeriod[] {
  return ORDER.filter((period) => (byPeriod[period] ?? 0) > 0);
}
