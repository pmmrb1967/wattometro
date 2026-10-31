// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * "Relatório do mês": a month's consumption, cost, baseload, highest quarter
 * hour and suggestions, printed (or saved as PDF) by the browser.
 * Calculation: src/domain/monthly-report.ts.
 */
import { monthFacts } from '../ai/tools/energy-tools';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { BarChart, SeriesChart } from '../components/Charts';
import {
  addMonths,
  dayTotal,
  monthDates,
  quartersByDay,
  type DayTotal,
} from '../domain/consumption';
import {
  monthlyReport,
  reportMonths,
  type MonthUsage,
  type Suggestion,
} from '../domain/monthly-report';
import { tariffOn } from '../domain/tariff';
import { t } from '../i18n/pt-PT';
import { formatCents } from '../lib/money';
import { formatLisbonDateTime, lisbonToday, type LocalDate } from '../lib/time';
import { formatKva, formatKwh, formatPower } from '../lib/units';
import { energyAxis } from './chart-axis';
import { dayBars, noon, SHORT_DAY, usedPeriods } from './chart-bars';
import { useHouseholdEnergy } from './household-energy';
import { HOUSE_METER, meterLabel, shellySeriesName } from './meters';
import { MeterSelect } from './MeterSelect';
import { ExplainButton } from './Explain';
import { ConsumptionTabs } from './ConsumptionTabs';
import { useSession } from './session';

const texts = t.report;
const periodNames = t.settings.tariff.periods;
const MONTH = new Intl.DateTimeFormat('pt-PT', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthName = (month: string) => MONTH.format(new Date(`${month}-15T12:00:00Z`));
const kwh = (wh: number) => formatKwh(wh, 1);
const signed = (pct: number) => `${pct > 0 ? '+' : ''}${pct} %`;

function Comparison({
  label,
  now,
  before,
  pct,
}: {
  label: string;
  now: MonthUsage;
  before: MonthUsage | null;
  pct: number | null;
}) {
  if (!before || pct === null) return <li>{texts.noComparison(label)}</li>;
  return (
    <li>
      {texts.comparison(
        label,
        signed(pct),
        formatKwh(before.perDayWh, 1),
        formatKwh(now.perDayWh, 1),
      )}
    </li>
  );
}

function suggestionText(
  suggestion: Suggestion,
  baseloadCents: number | null,
): { text: string; link?: [string, string] } {
  switch (suggestion.kind) {
    case 'baseload':
      return {
        text: texts.suggestions.baseload(
          suggestion.pct,
          formatPower(suggestion.watts),
          baseloadCents === null ? null : formatCents(baseloadCents),
        ),
      };
    case 'peak':
      return { text: texts.suggestions.peak(suggestion.pct) };
    case 'offEmpty':
      return { text: texts.suggestions.offEmpty(suggestion.pct) };
    case 'higherThanLastYear':
      return { text: texts.suggestions.higherThanLastYear(suggestion.pct) };
    case 'lowPeak':
      return {
        text: texts.suggestions.lowPeak(
          formatPower(suggestion.peakWatts),
          formatKva(suggestion.powerVa),
        ),
        link: ['/potencia', t.nav.power],
      };
    case 'simpleTariff':
      return { text: texts.suggestions.simpleTariff, link: ['/tarifarios', t.nav.tariffs] };
  }
}

export function Report() {
  const { me } = useSession();
  const energy = useHouseholdEnergy();
  const { error, tariffs, meters, devices, meter, quarters } = energy;
  const months = useMemo(() => (quarters ? reportMonths(quarters) : []), [quarters]);
  const [chosen, setChosen] = useState<string | null>(null);
  // By default the current month, still going (the days so far).
  const current = lisbonToday().slice(0, 7);
  const month = chosen ?? months.find((item) => item <= current) ?? months[0] ?? null;
  const lastDay = month ? (monthDates(month).at(-1) as LocalDate) : null;
  const tariff = tariffs && lastDay ? tariffOn(tariffs, lastDay) : null;
  const report = useMemo(
    () => (quarters && month ? monthlyReport(quarters, month, tariff) : null),
    [quarters, month, tariff],
  );
  const chart = useMemo(() => {
    if (!quarters || !month) return null;
    const periods =
      tariff && tariff.option !== 'simple'
        ? { option: tariff.option, cycle: tariff.cycle, periodsMap: tariff.periodsMap }
        : null;
    const from = Date.parse(`${month}-01T00:00:00Z`) / 1000 - 7200;
    const to = Date.parse(`${addMonths(month, 1)}-01T00:00:00Z`) / 1000 + 7200;
    const days = quartersByDay(
      quarters.filter(({ ts }) => ts >= from && ts < to),
      periods,
    );
    const totals = new Map<LocalDate, DayTotal>();
    for (const [date, dayQuarters] of days) totals.set(date, dayTotal(date, dayQuarters));
    const dates = monthDates(month);
    return { ...dayBars(dates, totals, 'month'), dates, totals };
  }, [quarters, month, tariff]);
  // The house: each day is E-Redes or, after its last day, the Shelly (houseQuarters), in their colours.
  const sources = useMemo(() => {
    if (!chart || meter !== HOUSE_METER || !energy.compare) return null;
    const from = energy.shellyFrom;
    const values = chart.dates.map((day) => chart.totals.get(day)?.totalWh ?? null);
    const isShelly = (day: LocalDate) => from !== null && day >= from;
    const eredes = values.map((wh, index) =>
      isShelly(chart.dates[index] as LocalDate) ? null : wh,
    );
    const shelly = values.map((wh, index) =>
      isShelly(chart.dates[index] as LocalDate) ? wh : null,
    );
    const lastEredes = chart.dates.filter((_, index) => eredes[index] !== null).at(-1);
    const firstShelly = chart.dates.find((_, index) => shelly[index] !== null);
    return { eredes, shelly, lastEredes, firstShelly };
  }, [chart, meter, energy.compare, energy.shellyFrom]);

  const [generated] = useState(() => formatLisbonDateTime(Math.floor(Date.now() / 1000)));
  const tabs = <ConsumptionTabs appliances={Boolean(energy.houseShelly)} />;
  if (error) {
    return (
      <>
        <h1>{texts.title}</h1>
        {tabs}
        <p className="error">{error}</p>
      </>
    );
  }
  if (meters === null || (meter && !quarters)) {
    return (
      <>
        <h1>{texts.title}</h1>
        {tabs}
        <p className="hint">{t.loading}</p>
      </>
    );
  }
  if (!month || !report) {
    return (
      <>
        <h1>{texts.title}</h1>
        {tabs}
        <p>
          {t.tariffs.noData} <Link to="/definicoes#dados">{t.tariffs.toSettings}</Link>
        </p>
      </>
    );
  }

  const { usage, cost } = report;
  const used = usedPeriods(report.byPeriod);
  const source = meterLabel(meter ?? '', devices, me.householdName);
  const sourceNames = {
    eredes: t.consumption.charts.eredesSeries,
    shelly: shellySeriesName(energy.houseShelly, devices),
  };
  return (
    <>
      <div className="print-only report-head">
        <p>{texts.household(me.householdName)}</p>
        <p>{texts.generated(generated)}</p>
      </div>
      <h1>{texts.heading(monthName(month))}</h1>
      {tabs}

      <section className="card form no-print">
        <div className="filters">
          <label>
            {texts.month}
            <select value={month} onChange={(event) => setChosen(event.target.value)}>
              {months.map((item) => (
                <option key={item} value={item}>
                  {monthName(item)}
                </option>
              ))}
            </select>
          </label>
          <MeterSelect energy={energy} label={t.tariffs.meter} />
        </div>
        <button type="button" className="primary" onClick={() => window.print()}>
          {texts.print}
        </button>
      </section>

      <section className="card">
        <h2>{texts.costTitle}</h2>
        {cost ? (
          <>
            <p className="big">{formatCents(cost.totalCents)}</p>
            <ul className="caveats">
              <li>{texts.costEnergy(formatCents(cost.energyCents))}</li>
              <li>{texts.costPower(formatCents(cost.powerCents))}</li>
              <li>{texts.costTaxes(formatCents(cost.taxesCents))}</li>
            </ul>
            <p className="hint">
              {texts.costHint(usage.daysWithData, tariff?.supplier ?? t.tariffs.yourContract)}
            </p>
          </>
        ) : (
          <p className="hint">
            {texts.noTariff}{' '}
            <Link className="no-print" to="/definicoes#tarifario">
              {t.tariffs.toSettings}
            </Link>
          </p>
        )}
      </section>

      <section className="card">
        <h2>{texts.suggestionsTitle}</h2>
        {report.suggestions.length === 0 ? (
          <p>{texts.noSuggestions}</p>
        ) : (
          <ul className="caveats">
            {report.suggestions.map((suggestion) => {
              const { text, link } = suggestionText(suggestion, report.baseload?.cents ?? null);
              return (
                <li key={suggestion.kind}>
                  {text}
                  {link && (
                    <>
                      {' '}
                      <Link className="no-print" to={link[0]}>
                        {texts.see(link[1])}
                      </Link>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <div className="no-print">
          <ExplainButton
            key={month}
            subject="month"
            facts={() =>
              monthFacts({ quarters: quarters ?? [], tariffs, today: lisbonToday() }, month!)
            }
          />
        </div>
      </section>

      <section className="card">
        <h2>{texts.usageTitle}</h2>
        <p className="big">{kwh(usage.totalWh)}</p>
        <p>{texts.perDay(formatKwh(usage.perDayWh, 1))}</p>
        {usage.daysWithData < usage.days && (
          <p className="hint">{texts.missingDays(usage.daysWithData, usage.days)}</p>
        )}
        <ul className="caveats">
          <Comparison
            label={monthName(addMonths(month, -1))}
            now={usage}
            before={report.previous}
            pct={report.vsPrevious}
          />
          <Comparison
            label={monthName(addMonths(month, -12))}
            now={usage}
            before={report.lastYear}
            pct={report.vsLastYear}
          />
        </ul>
        {chart && sources && (
          <>
            <SeriesChart
              kind="source"
              slots={chart.dates.map((day, index) => {
                const key = sources.shelly[index] !== null ? 'shelly' : 'eredes';
                const wh = sources[key][index];
                return {
                  key: day,
                  title: t.consumption.charts.seriesTitle(
                    SHORT_DAY.format(noon(day)),
                    wh === null || wh === undefined
                      ? t.consumption.charts.noData
                      : `${sourceNames[key]} ${formatKwh(wh, 2)}`,
                  ),
                };
              })}
              series={(['eredes', 'shelly'] as const).map((key) => ({
                name: sourceNames[key],
                className: `series-${key}`,
                values: sources[key],
              }))}
              ticks={chart.ticks}
              axis={energyAxis}
              caption={t.consumption.charts.axisPerDay}
              label={texts.chartLabel(monthName(month))}
            />
            <ul className="chart-legend">
              {/* A source without days this month stays out of the legend. */}
              {(['eredes', 'shelly'] as const)
                .filter((key) => sources[key].some((wh) => wh !== null))
                .map((key) => (
                  <li key={key}>
                    <span className={`legend-swatch series-${key}`} aria-hidden="true" />
                    {sourceNames[key]}
                  </li>
                ))}
            </ul>
            {sources.lastEredes && sources.firstShelly && (
              <p className="hint">
                {texts.sources(
                  SHORT_DAY.format(noon(sources.lastEredes)),
                  SHORT_DAY.format(noon(sources.firstShelly)),
                )}
              </p>
            )}
          </>
        )}
        {chart && !sources && (
          <BarChart
            bars={chart.bars}
            ticks={chart.ticks}
            axis={energyAxis}
            caption={t.consumption.charts.axisPerDay}
            label={texts.chartLabel(monthName(month))}
          />
        )}
        {used.length > 1 && (
          <ul className="chart-legend">
            {used.map((period) => (
              <li key={period}>
                {/* By source, the bars are not by period: no swatch to match. */}
                {!sources && (
                  <span className={`legend-swatch period-${period}`} aria-hidden="true" />
                )}
                {`${periodNames[period]}: ${kwh(report.byPeriod[period] ?? 0)} (${Math.round(((report.byPeriod[period] ?? 0) * 100) / (usage.totalWh || 1))} %)`}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>{texts.baseloadTitle}</h2>
        {report.baseload ? (
          <>
            <p className="big">{formatPower(report.baseload.watts)}</p>
            {report.baseload.cents !== null && (
              <p>{texts.baseloadCost(formatCents(report.baseload.cents))}</p>
            )}
          </>
        ) : (
          <p className="hint">{t.consumption.baseload.noNights}</p>
        )}
      </section>

      <section className="card">
        <h2>{texts.peakTitle}</h2>
        {report.peak && (
          <>
            <p className="big">{formatPower(report.peak.watts)}</p>
            <p>
              {texts.peakWhen(formatLisbonDateTime(report.peak.ts))}
              {tariff ? ` ${texts.peakContracted(formatKva(tariff.powerVa))}` : ''}
            </p>
            <p className="hint">{texts.peakHint}</p>
          </>
        )}
      </section>

      <section className="card">
        <h2>{texts.notesTitle}</h2>
        <ul className="hint caveats">
          <li>{texts.notes.source(source)}</li>
          <li>{texts.notes.comparison}</li>
          <li>{texts.notes.estimate}</li>
          <li>{texts.notes.rules}</li>
        </ul>
      </section>
    </>
  );
}
