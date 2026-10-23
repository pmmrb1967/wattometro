// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * "Consumo": energy per quarter hour (a day) or per day (a week, a month),
 * coloured by the tariff's periods, and the hour × weekday profile.
 * Calculation: src/domain/consumption.ts.
 */
import { useMemo, useState } from 'react';
import { BarChart, HourHeatmap, type Bar } from '../components/Charts';
import {
  addDays,
  addMonths,
  dayTotal,
  hourlyProfile,
  monthDates,
  quartersByDay,
  weekDates,
  weekdayOf,
  type DayTotal,
  type Periods,
} from '../domain/consumption';
import type { BillingPeriod } from '../domain/tariff';
import { t } from '../i18n/pt-PT';
import { formatLisbonTime, type LocalDate } from '../lib/time';
import { formatKwh } from '../lib/units';

const texts = t.consumption.charts;
const periodNames = t.settings.tariff.periods;
type View = 'day' | 'week' | 'month';
const VIEWS: View[] = ['day', 'week', 'month'];
/** Bottom to top. */
const ORDER: BillingPeriod[] = ['empty', 'offEmpty', 'full', 'peak', 'simple'];
/** Fewer quarters than this: an incomplete day. */
const FULL_DAY_QUARTERS = 92;

const noon = (date: LocalDate) => new Date(`${date}T12:00:00Z`);
const DAY_FORMAT = new Intl.DateTimeFormat('pt-PT', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const SHORT_DAY = new Intl.DateTimeFormat('pt-PT', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const MONTH_FORMAT = new Intl.DateTimeFormat('pt-PT', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

const kwh = (wh: number) => formatKwh(wh, 2);

function segments(byPeriod: Partial<Record<BillingPeriod, number>>) {
  return ORDER.filter((period) => (byPeriod[period] ?? 0) > 0).map((period) => ({
    period,
    value: byPeriod[period] ?? 0,
  }));
}

/** The dates a view shows around the chosen date. */
function datesOf(view: View, date: LocalDate): LocalDate[] {
  if (view === 'day') return [date];
  return view === 'week' ? weekDates(date) : monthDates(date.slice(0, 7));
}

function move(view: View, date: LocalDate, step: -1 | 1): LocalDate {
  if (view === 'day') return addDays(date, step);
  if (view === 'week') return addDays(date, 7 * step);
  return `${addMonths(date.slice(0, 7), step)}-01`;
}

function title(view: View, dates: LocalDate[]): string {
  const first = dates[0] as LocalDate;
  if (view === 'day') return DAY_FORMAT.format(noon(first));
  if (view === 'month') return MONTH_FORMAT.format(noon(first));
  return texts.weekOf(SHORT_DAY.format(noon(first)), SHORT_DAY.format(noon(dates[6] as LocalDate)));
}

export function ConsumptionCharts({
  quarters,
  periods,
}: {
  quarters: { ts: number; energyWh: number }[];
  periods: Periods;
}) {
  const days = useMemo(() => quartersByDay(quarters, periods), [quarters, periods]);
  const totals = useMemo(() => {
    const map = new Map<LocalDate, DayTotal>();
    for (const [date, dayQuarters] of days) map.set(date, dayTotal(date, dayQuarters));
    return map;
  }, [days]);
  const dates = [...days.keys()];
  const firstDate = dates[0];
  const lastDate = dates.at(-1);
  const profile = useMemo(
    () => (lastDate ? hourlyProfile(days, lastDate) : null),
    [days, lastDate],
  );
  const [view, setView] = useState<View>('day');
  const [chosen, setChosen] = useState<LocalDate | null>(null);
  if (!firstDate || !lastDate || !profile) return null;

  const date = chosen ?? lastDate;
  const shown = datesOf(view, date);
  const canBack = (shown[0] as LocalDate) > firstDate;
  const canForward = (shown.at(-1) as LocalDate) < lastDate;

  let bars: Bar[];
  let ticks: { index: number; label: string }[];
  let total: Partial<Record<BillingPeriod, number>> = {};
  if (view === 'day') {
    const dayQuarters = days.get(date) ?? [];
    bars = dayQuarters.map((quarter) => ({
      key: String(quarter.ts),
      title: texts.quarterTitle(
        formatLisbonTime(quarter.ts),
        kwh(quarter.energyWh),
        periodNames[quarter.period],
      ),
      segments: [{ period: quarter.period, value: quarter.energyWh }],
    }));
    ticks = dayQuarters.flatMap((quarter, index) => {
      const time = formatLisbonTime(quarter.ts);
      return ['00:00', '06:00', '12:00', '18:00'].includes(time)
        ? [{ index, label: `${Number(time.slice(0, 2))} h` }]
        : [];
    });
    total = totals.get(date)?.byPeriod ?? {};
  } else {
    bars = shown.map((day) => {
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
    ticks = shown.flatMap((day, index) =>
      view === 'week'
        ? [{ index, label: texts.weekdays[weekdayOf(day)] ?? '' }]
        : [1, 8, 15, 22, 29].includes(Number(day.slice(8)))
          ? [{ index, label: String(Number(day.slice(8))) }]
          : [],
    );
    for (const day of shown) {
      for (const [period, wh] of Object.entries(totals.get(day)?.byPeriod ?? {})) {
        total[period as BillingPeriod] = (total[period as BillingPeriod] ?? 0) + wh;
      }
    }
  }
  const totalWh = Object.values(total).reduce((sum, wh) => sum + wh, 0);
  const used = ORDER.filter((period) => (total[period] ?? 0) > 0);

  return (
    <>
      <section className="card form">
        <h2>{texts.title}</h2>
        <div className="segmented" role="group" aria-label={texts.title}>
          {VIEWS.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={view === item}
              onClick={() => setView(item)}
            >
              {texts.views[item]}
            </button>
          ))}
        </div>
        <div className="chart-nav">
          <button
            type="button"
            className="secondary"
            disabled={!canBack}
            aria-label={texts.previous}
            onClick={() => setChosen(move(view, date, -1))}
          >
            ‹
          </button>
          <strong>{title(view, shown)}</strong>
          <button
            type="button"
            className="secondary"
            disabled={!canForward}
            aria-label={texts.next}
            onClick={() => setChosen(move(view, date, 1))}
          >
            ›
          </button>
        </div>
        {totalWh === 0 ? (
          <p className="hint">{texts.noData}</p>
        ) : (
          <>
            <p>
              {texts.total(kwh(totalWh))}
              {used.length > 1 &&
                ` · ${used
                  .map(
                    (period) =>
                      `${periodNames[period].toLowerCase()} ${Math.round(((total[period] ?? 0) * 100) / totalWh)} %`,
                  )
                  .join(' · ')}`}
            </p>
            <BarChart
              bars={bars}
              ticks={ticks}
              maxLabel={(max) =>
                view === 'day' ? texts.perQuarter(kwh(max)) : texts.perDay(kwh(max))
              }
              label={`${texts.title}: ${title(view, shown)}, ${texts.total(kwh(totalWh))}`}
            />
            {used.length > 1 && (
              <ul className="chart-legend">
                {used.map((period) => (
                  <li key={period}>
                    <span className={`legend-swatch period-${period}`} aria-hidden="true" />
                    {periodNames[period]}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {view !== 'day' && <p className="hint">{texts.partialHint}</p>}
      </section>

      <section className="card form">
        <h2>{texts.heatmapTitle}</h2>
        <p className="hint">{texts.heatmapIntro}</p>
        <HourHeatmap
          rows={texts.weekdays}
          values={profile}
          label={texts.heatmapTitle}
          title={(row, hour, value) =>
            texts.cellTitle(
              texts.weekdays[row] ?? '',
              hour,
              value === null ? texts.noData : kwh(value),
            )
          }
        />
        <p className="hint">{texts.heatmapLegend}</p>
      </section>
    </>
  );
}
