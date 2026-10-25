// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * "Consumo": energy per quarter hour (a day) or per day (a week, a month),
 * coloured by the tariff's periods, and the hour × weekday profile. Today, so
 * far, is shown in the bars only (the profile uses whole days). With the house,
 * E-Redes and the Shelly side by side instead (compare-series.ts).
 * Calculation: src/domain/consumption.ts.
 */
import { useMemo, useState } from 'react';
import { BarChart, HourHeatmap, SeriesChart, type Bar } from '../components/Charts';
import { compareSeries, daySlots, differencePct, hourTicks } from './compare-series';
import { dayBars, noon, SHORT_DAY, usedPeriods } from './chart-bars';
import {
  addDays,
  addMonths,
  dayTotal,
  hourlyProfile,
  monthDates,
  quartersByDay,
  weekDates,
  type DayTotal,
  type Periods,
} from '../domain/consumption';
import type { BillingPeriod } from '../domain/tariff';
import { t } from '../i18n/pt-PT';
import { formatLisbonTime, lisbonDate, type LocalDate } from '../lib/time';
import { formatKwh, formatPower, quarterAverageW } from '../lib/units';
import { energyAxis, powerAxis } from './chart-axis';

const texts = t.consumption.charts;
const periodNames = t.settings.tariff.periods;
type View = 'day' | 'week' | 'month';
const VIEWS: View[] = ['day', 'week', 'month'];
const DAY_FORMAT = new Intl.DateTimeFormat('pt-PT', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const MONTH_FORMAT = new Intl.DateTimeFormat('pt-PT', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

const kwh = (wh: number) => formatKwh(wh, 2);

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

type Quarter = { ts: number; energyWh: number };

export function ConsumptionCharts({
  quarters,
  today,
  shellyFrom,
  compare,
  shellyName,
  periods,
}: {
  /** Whole days. */
  quarters: Quarter[];
  /** Today so far; null without it. */
  today: Quarter[] | null;
  /** First day measured by the Shelly instead of E-Redes; null for none. */
  shellyFrom: LocalDate | null;
  /** The house: each system's whole days, shown side by side; null for one meter. */
  compare: { eredes: Quarter[]; shelly: Quarter[] } | null;
  /** The Shelly's name, for the legend. */
  shellyName: string;
  periods: Periods;
}) {
  const whole = useMemo(() => quartersByDay(quarters, periods), [quarters, periods]);
  const days = useMemo(
    () => (today?.length ? quartersByDay([...quarters, ...today], periods) : whole),
    [whole, quarters, today, periods],
  );
  const firstToday = today?.[0];
  const todayDate = firstToday ? lisbonDate(firstToday.ts) : null;
  const totals = useMemo(() => {
    const map = new Map<LocalDate, DayTotal>();
    for (const [date, dayQuarters] of days) map.set(date, dayTotal(date, dayQuarters));
    return map;
  }, [days]);
  // The Shelly's days the house series leaves out (E-Redes has them) still count here.
  const shellyAll = useMemo(
    () => (compare ? [...compare.shelly, ...(today ?? [])] : []),
    [compare, today],
  );
  const shellyDates = useMemo(() => [...quartersByDay(shellyAll, null).keys()], [shellyAll]);
  const dates = [...new Set([...days.keys(), ...shellyDates])].sort();
  const firstDate = dates[0];
  const lastDate = dates.at(-1);
  const lastWhole = [...whole.keys()].at(-1);
  const profile = useMemo(
    () => (lastWhole ? hourlyProfile(whole, lastWhole) : null),
    [whole, lastWhole],
  );
  const [view, setView] = useState<View>('day');
  const [chosen, setChosen] = useState<LocalDate | null>(null);
  if (!firstDate || !lastDate) return null;

  const date = chosen ?? lastDate;
  const shown = datesOf(view, date);
  const canBack = (shown[0] as LocalDate) > firstDate;
  const canForward = (shown.at(-1) as LocalDate) < lastDate;

  let bars: Bar[];
  let ticks: { index: number; label: string }[];
  let total: Partial<Record<BillingPeriod, number>> = {};
  if (view === 'day') {
    // The whole day on the axis, so the hours stay in place on a partial day.
    const slots = daySlots(date);
    const byTs = new Map((days.get(date) ?? []).map((quarter) => [quarter.ts, quarter]));
    bars = slots.map((ts) => {
      const quarter = byTs.get(ts);
      return {
        key: String(ts),
        title: quarter
          ? texts.quarterTitle(
              formatLisbonTime(ts),
              kwh(quarter.energyWh),
              formatPower(quarterAverageW(quarter.energyWh)),
              periodNames[quarter.period],
            )
          : texts.dayTitle(formatLisbonTime(ts), texts.noData),
        // A day in average power (W), so the scale reads like the meter's.
        segments: quarter
          ? [{ period: quarter.period, value: quarterAverageW(quarter.energyWh) }]
          : [],
      };
    });
    ticks = hourTicks(slots);
    total = totals.get(date)?.byPeriod ?? {};
  } else {
    ({ bars, ticks } = dayBars(shown, totals, view));
    for (const day of shown) {
      for (const [period, wh] of Object.entries(totals.get(day)?.byPeriod ?? {})) {
        total[period as BillingPeriod] = (total[period as BillingPeriod] ?? 0) + wh;
      }
    }
  }
  const totalWh = Object.values(total).reduce((sum, wh) => sum + wh, 0);
  const used = usedPeriods(total);
  const comparison = compare
    ? compareSeries(compare.eredes, shellyAll, view === 'day' ? 'day' : 'days', shown)
    : null;
  const difference = comparison ? differencePct(comparison.common) : null;
  const seriesNames = { eredes: texts.eredesSeries, shelly: shellyName };
  const partsOf = (values: { eredes: number | null; shelly: number | null }) =>
    (['eredes', 'shelly'] as const)
      .map((key) => `${seriesNames[key]} ${values[key] === null ? texts.noData : kwh(values[key])}`)
      .join(' · ');

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
          <strong>
            {title(view, shown)}
            {view === 'day' && date === todayDate && ` · ${texts.today}`}
          </strong>
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
        {comparison ? (
          comparison.totals.eredes + comparison.totals.shelly === 0 ? (
            <p className="hint">{texts.noData}</p>
          ) : (
            <>
              <p>
                {texts.seriesTotals(
                  partsOf({
                    eredes: comparison.slots.some((slot) => slot.eredes !== null)
                      ? comparison.totals.eredes
                      : null,
                    shelly: comparison.slots.some((slot) => slot.shelly !== null)
                      ? comparison.totals.shelly
                      : null,
                  }),
                )}
              </p>
              <SeriesChart
                kind={view === 'day' ? 'lines' : 'bars'}
                slots={comparison.slots.map((slot) => ({
                  key: slot.key,
                  title: texts.seriesTitle(
                    typeof slot.at === 'number'
                      ? formatLisbonTime(slot.at)
                      : SHORT_DAY.format(noon(slot.at)),
                    partsOf(slot),
                  ),
                }))}
                series={(['eredes', 'shelly'] as const).map((key) => ({
                  name: seriesNames[key],
                  className: `series-${key}`,
                  values: comparison.slots.map((slot) => {
                    const wh = slot[key];
                    return wh === null || view !== 'day' ? wh : quarterAverageW(wh);
                  }),
                }))}
                ticks={view === 'day' ? ticks : dayBars(shown, totals, view).ticks}
                axis={view === 'day' ? powerAxis : energyAxis}
                caption={view === 'day' ? texts.axisPower : texts.axisPerDay}
                label={`${texts.title}: ${title(view, shown)}`}
              />
              <ul className="chart-legend">
                {(['eredes', 'shelly'] as const).map((key) => (
                  <li key={key}>
                    <span className={`legend-swatch series-${key}`} aria-hidden="true" />
                    {seriesNames[key]}
                  </li>
                ))}
              </ul>
              {difference && (
                <p className="hint">
                  {texts.difference(
                    difference.direction,
                    difference.pct,
                    comparison.common.count,
                    view === 'day' ? 'quarter' : 'day',
                  )}
                </p>
              )}
            </>
          )
        ) : totalWh === 0 ? (
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
              axis={view === 'day' ? powerAxis : energyAxis}
              caption={view === 'day' ? texts.axisPower : texts.axisPerDay}
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
        {view !== 'day' && !comparison && <p className="hint">{texts.partialHint}</p>}
        {shellyFrom && comparison && (
          <p className="hint">{texts.shellyFrom(SHORT_DAY.format(noon(shellyFrom)))}</p>
        )}
      </section>

      {profile && (
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
      )}
    </>
  );
}
