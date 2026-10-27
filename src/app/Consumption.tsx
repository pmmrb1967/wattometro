// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * "Consumo": the last 12 months of quarter hours of a meter (E-Redes or a
 * Shelly). Baseload: src/domain/baseload.ts.
 */
import { useMemo } from 'react';
import { Link } from 'react-router';
import type { Periods } from '../domain/consumption';
import { baseloadCost, monthlyBaseload, nightlyBaseload, recentBaseload } from '../domain/baseload';
import type { Tariff } from '../domain/tariff';
import { HowItWorks } from '../components/HowItWorks';
import { t } from '../i18n/pt-PT';
import { formatCents } from '../lib/money';
import { formatKwh, formatPower } from '../lib/units';
import { AnomalyList } from './Anomalies';
import { DayEvents } from './DayEvents';
import { RecentAppliances } from './RecentAppliances';
import { BillForecastDetail } from './BillForecast';
import { ConsumptionCharts } from './ConsumptionCharts';
import { lastYear, useHouseholdEnergy } from './household-energy';
import { HOUSE_METER, shellyName } from './meters';
import { MeterSelect } from './MeterSelect';
import { Reconciliation } from './Reconciliation';

const texts = t.consumption;

type Quarters = { ts: number; energyWh: number }[];

const MONTH = new Intl.DateTimeFormat('pt-PT', { month: 'short', timeZone: 'UTC' });
/** E.g. "jul. 2026". */
const monthLabel = (month: string) =>
  `${MONTH.format(new Date(`${month}-15T12:00:00Z`))} ${month.slice(0, 4)}`;

function Baseload({
  quarters,
  tariff,
  eredes,
}: {
  quarters: Quarters;
  tariff: Tariff | null;
  eredes: boolean;
}) {
  const nights = useMemo(() => nightlyBaseload(quarters), [quarters]);
  const recent = recentBaseload(nights);
  const months = useMemo(() => monthlyBaseload(nights), [nights]);
  const cost = useMemo(
    () => (recent && tariff ? baseloadCost(recent.watts, quarters, tariff) : null),
    [recent, quarters, tariff],
  );
  if (!recent) {
    return (
      <section className="card">
        <h2>{texts.baseload.title}</h2>
        <p>{texts.baseload.noNights}</p>
      </section>
    );
  }
  const highest = Math.max(...months.map((month) => month.watts), 1);
  return (
    <section className="card form" id="consumo-base">
      <h2>{texts.baseload.title}</h2>
      <p className="lead">{texts.baseload.intro}</p>
      <p className="big">{formatPower(recent.watts)}</p>
      <p className="hint">{texts.baseload.recent(recent.nights)}</p>
      {cost ? (
        <p>{texts.baseload.cost(formatCents(cost.annualCents), formatKwh(cost.annualWh, 0))}</p>
      ) : (
        <p className="hint">
          {texts.baseload.noTariff} <Link to="/definicoes">{t.tariffs.toSettings}</Link>
        </p>
      )}
      {months.length > 1 && (
        <>
          <h3>{texts.baseload.monthsTitle}</h3>
          <ul className="bar-list">
            {months.map((month) => (
              <li key={month.month}>
                <span className="bar-label">{monthLabel(month.month)}</span>
                <span className="bar-track" aria-hidden="true">
                  <span
                    className="bar-fill"
                    style={{ width: `${Math.round((month.watts * 100) / highest)}%` }}
                  />
                </span>
                <span className="bar-value">{formatPower(month.watts)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <HowItWorks>
        <ul className="hint caveats">
          <li>{texts.baseload.method}</li>
          {eredes && <li>{texts.baseload.eredesNote}</li>}
          {cost && <li>{texts.baseload.costNote}</li>}
        </ul>
      </HowItWorks>
    </section>
  );
}

export function Consumption() {
  const energy = useHouseholdEnergy();
  const { window, error, tariff, meters, meter, quarters: all } = energy;
  // The last 365 days (the window starts earlier, for the monthly report).
  const quarters = useMemo(() => (all ? lastYear(all, window) : null), [all, window]);
  // Bars coloured by the tariff's periods (one colour with the simple option or no tariff).
  const periods = useMemo<Periods>(
    () =>
      tariff && tariff.option !== 'simple'
        ? { option: tariff.option, cycle: tariff.cycle, periodsMap: tariff.periodsMap }
        : null,
    [tariff],
  );
  const header = (
    <>
      <h1>{texts.title}</h1>
      <p className="lead">{texts.intro}</p>
      <p>
        <Link className="secondary button-link" to="/consumo/relatorio">
          {t.report.open}
        </Link>
      </p>
    </>
  );
  if (error) {
    return (
      <>
        {header}
        <p className="error">{error}</p>
      </>
    );
  }
  if (meters === null) {
    return (
      <>
        {header}
        <p className="hint">{t.loading}</p>
      </>
    );
  }
  if (meters.length === 0) {
    return (
      <>
        {header}
        <p>
          {t.tariffs.noData} <Link to="/definicoes">{t.tariffs.toSettings}</Link>
        </p>
      </>
    );
  }

  return (
    <>
      {header}
      {energy.choices.length > 1 && (
        <section className="card form">
          <MeterSelect energy={energy} label={t.tariffs.meter} />
        </section>
      )}
      {!quarters && <p className="hint">{t.loading}</p>}
      {quarters && (
        <>
          <BillForecastDetail energy={energy} />
          <Baseload
            quarters={quarters}
            tariff={tariff ?? null}
            eredes={meter === 'eredes' || meter === HOUSE_METER}
          />
          <AnomalyList energy={energy} />
          <RecentAppliances energy={energy} />
          <DayEvents energy={energy} />
          <ConsumptionCharts
            quarters={quarters}
            today={energy.today}
            shellyFrom={energy.shellyFrom}
            compare={energy.compare}
            shellyName={
              energy.houseShelly ? shellyName(energy.houseShelly, energy.devices) : 'Shelly'
            }
            periods={periods}
          />
          {energy.compare && (
            <Reconciliation
              compare={energy.compare}
              shellyName={
                energy.houseShelly ? shellyName(energy.houseShelly, energy.devices) : 'Shelly'
              }
            />
          )}
        </>
      )}
    </>
  );
}
