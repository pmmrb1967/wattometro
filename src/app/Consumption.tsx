// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * "Consumo": the last 12 months of quarter hours of a meter (E-Redes or a
 * Shelly). Baseload: src/domain/baseload.ts.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { Periods } from '../domain/consumption';
import { baseloadCost, monthlyBaseload, nightlyBaseload, recentBaseload } from '../domain/baseload';
import { tariffOn, type Tariff } from '../domain/tariff';
import { t } from '../i18n/pt-PT';
import { formatCents } from '../lib/money';
import { lisbonDate, lisbonToday, startOfLisbonDay } from '../lib/time';
import { formatKwh, formatPower } from '../lib/units';
import {
  fetchDevices,
  fetchEnergyMeters,
  fetchTariffs,
  type Device,
  type EnergyMeter,
} from './api';
import { ConsumptionCharts } from './ConsumptionCharts';
import { busiestMeter, meterLabel } from './meters';
import { loadQuarters } from './energy-cache';
import { useSession } from './session';

const texts = t.consumption;
const YEAR = 365 * 86_400;

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
    <section className="card form">
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
      <ul className="hint caveats">
        <li>{texts.baseload.method}</li>
        {eredes && <li>{texts.baseload.eredesNote}</li>}
        {cost && <li>{texts.baseload.costNote}</li>}
      </ul>
    </section>
  );
}

export function Consumption() {
  const { me, signOut } = useSession();
  const [tariff, setTariff] = useState<Tariff | null>(null);
  const [meters, setMeters] = useState<EnergyMeter[] | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [meter, setMeter] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<{ meter: string; quarters: Quarters } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The year before today (Lisbon), whole days.
  const [range] = useState(() => {
    const to = startOfLisbonDay(lisbonToday());
    return { from: startOfLisbonDay(lisbonDate(to - YEAR)), to };
  });

  useEffect(() => {
    let active = true;
    void Promise.all([
      fetchTariffs(),
      fetchEnergyMeters(range.from, range.to),
      fetchDevices(),
    ]).then(([tariffs, energy, deviceList]) => {
      if (!active) return;
      if ([tariffs, energy, deviceList].some((o) => !o.ok && o.reason === 'unauthenticated')) {
        signOut();
        return;
      }
      if (!energy.ok) {
        setError(t.errors.unavailable);
        return;
      }
      // Without a tariff the baseload is still shown, without its cost.
      if (tariffs.ok) setTariff(tariffOn(tariffs.tariffs, lisbonToday()));
      setMeters(energy.meters);
      if (deviceList.ok) setDevices(deviceList.devices);
      setMeter(busiestMeter(energy.meters));
    });
    return () => {
      active = false;
    };
  }, [range, signOut]);

  useEffect(() => {
    if (!meter) return;
    let active = true;
    void loadQuarters(me.householdId, meter, range.from, range.to).then((outcome) => {
      if (!active) return;
      if (outcome.ok) setLoaded({ meter, quarters: outcome.quarters });
      else if (outcome.reason === 'unauthenticated') signOut();
      else setError(t.errors.unavailable);
    });
    return () => {
      active = false;
    };
  }, [me.householdId, meter, range, signOut]);

  const quarters = loaded?.meter === meter ? loaded.quarters : null;
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
      {meters.length > 1 && (
        <section className="card form">
          <label>
            {t.tariffs.meter}
            <select value={meter ?? ''} onChange={(event) => setMeter(event.target.value)}>
              {meters.map((item) => (
                <option key={item.meter} value={item.meter}>
                  {meterLabel(item.meter, devices)}
                </option>
              ))}
            </select>
          </label>
        </section>
      )}
      {!quarters && <p className="hint">{t.loading}</p>}
      {quarters && (
        <>
          <Baseload quarters={quarters} tariff={tariff} eredes={meter === 'eredes'} />
          <ConsumptionCharts quarters={quarters} periods={periods} />
        </>
      )}
    </>
  );
}
