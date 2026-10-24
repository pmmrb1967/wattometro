// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * "Relatório do mês": a month's consumption, cost, baseload, highest quarter
 * hour and suggestions, printed (or saved as PDF) by the browser.
 * Calculation: src/domain/monthly-report.ts.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { BarChart } from '../components/Charts';
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
import { dayBars, usedPeriods } from './chart-bars';
import { useHouseholdEnergy } from './household-energy';
import { meterLabel } from './meters';
import { MeterSelect } from './MeterSelect';
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

function suggestionText(suggestion: Suggestion): { text: string; link?: [string, string] } {
  switch (suggestion.kind) {
    case 'baseload':
      return { text: texts.suggestions.baseload(suggestion.pct, formatPower(suggestion.watts)) };
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
  // By default the last whole month (the current one is still going).
  const current = lisbonToday().slice(0, 7);
  const month = chosen ?? months.find((item) => item < current) ?? months[0] ?? null;
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
    return dayBars(monthDates(month), totals, 'month');
  }, [quarters, month, tariff]);

  const [generated] = useState(() => formatLisbonDateTime(Math.floor(Date.now() / 1000)));
  const back = (
    <p className="no-print">
      <Link to="/consumo">{texts.back}</Link>
    </p>
  );
  if (error) {
    return (
      <>
        {back}
        <h1>{texts.title}</h1>
        <p className="error">{error}</p>
      </>
    );
  }
  if (meters === null || (meter && !quarters)) {
    return (
      <>
        {back}
        <h1>{texts.title}</h1>
        <p className="hint">{t.loading}</p>
      </>
    );
  }
  if (!month || !report) {
    return (
      <>
        {back}
        <h1>{texts.title}</h1>
        <p>
          {t.tariffs.noData} <Link to="/definicoes">{t.tariffs.toSettings}</Link>
        </p>
      </>
    );
  }

  const { usage, cost } = report;
  const used = usedPeriods(report.byPeriod);
  const source = meterLabel(meter ?? '', devices);
  return (
    <>
      {back}
      <div className="print-only report-head">
        <p>{texts.household(me.householdName)}</p>
        <p>{texts.generated(generated)}</p>
      </div>
      <h1>{texts.heading(monthName(month))}</h1>

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
        {chart && (
          <BarChart
            bars={chart.bars}
            ticks={chart.ticks}
            maxLabel={(max) => t.consumption.charts.perDay(formatKwh(max, 2))}
            label={texts.chartLabel(monthName(month))}
          />
        )}
        {used.length > 1 && (
          <ul className="chart-legend">
            {used.map((period) => (
              <li key={period}>
                <span className={`legend-swatch period-${period}`} aria-hidden="true" />
                {`${periodNames[period]}: ${kwh(report.byPeriod[period] ?? 0)} (${Math.round(((report.byPeriod[period] ?? 0) * 100) / (usage.totalWh || 1))} %)`}
              </li>
            ))}
          </ul>
        )}
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
            <Link className="no-print" to="/definicoes">
              {t.tariffs.toSettings}
            </Link>
          </p>
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
        <h2>{texts.suggestionsTitle}</h2>
        {report.suggestions.length === 0 ? (
          <p>{texts.noSuggestions}</p>
        ) : (
          <ul className="caveats">
            {report.suggestions.map((suggestion) => {
              const { text, link } = suggestionText(suggestion);
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
