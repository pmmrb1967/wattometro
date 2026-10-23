// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * "Tarifários": the last 12 months of real consumption priced with every ERSE
 * offer at the contracted power, against the current contract, and how much
 * would have to move to the empty period for bi- or tri-hourly to pay off.
 * Calculation: src/domain/compare.ts.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { annualUsage, compareOffers, type OfferResult, type Shift } from '../domain/compare';
import type { Offer } from '../domain/erse';
import { tariffOn, type Tariff } from '../domain/tariff';
import { t } from '../i18n/pt-PT';
import { formatCents } from '../lib/money';
import { lisbonDate, lisbonToday, startOfLisbonDay } from '../lib/time';
import { formatKva, formatKwh } from '../lib/units';
import {
  fetchDevices,
  fetchEnergyMeters,
  fetchOffers,
  fetchQuarterEnergy,
  fetchTariffs,
  type Device,
  type EnergyMeter,
} from './api';
import { busiestMeter, meterLabel } from './meters';
import { useSession } from './session';

const texts = t.tariffs;
const YEAR = 365 * 86_400;
const SHOWN = 15;

type Quarters = { ts: number; energyWh: number }[];

const optionLabel = (result: OfferResult) =>
  result.option === 'simple'
    ? t.settings.tariff.options.simple
    : `${t.settings.tariff.options[result.option]} · ${t.settings.tariff.cycles[result.cycle].toLowerCase()}`;

function ShiftLine({ option, shift }: { option: 'bi' | 'tri'; shift: Shift | null }) {
  const name = t.settings.tariff.options[option];
  if (!shift) return <li>{texts.shiftNever(name)}</li>;
  if (shift.neededWh === 0) {
    return <li>{texts.shiftAlready(name, shift.best.offer.supplier)}</li>;
  }
  const pct = Math.round((shift.neededWh * 100) / shift.movableWh);
  return (
    <li>
      {texts.shiftNeeded(
        name,
        formatKwh(shift.neededWh, 0),
        formatKwh(Math.round(shift.neededWh / 12), 0),
        pct,
        shift.best.offer.supplier,
      )}
    </li>
  );
}

export function Tariffs() {
  const { signOut } = useSession();
  const [tariff, setTariff] = useState<Tariff | null | undefined>(undefined);
  const [meters, setMeters] = useState<EnergyMeter[] | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [meter, setMeter] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<{ meter: string; quarters: Quarters } | null>(null);
  const [offers, setOffers] = useState<Offer[] | null | 'none'>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({ option: 'all', noLoyalty: false, noServices: false });

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
      fetchOffers(),
    ]).then(([tariffs, energy, deviceList, file]) => {
      if (!active) return;
      if ([tariffs, energy, deviceList].some((o) => !o.ok && o.reason === 'unauthenticated')) {
        signOut();
        return;
      }
      if (!tariffs.ok || !energy.ok) {
        setError(t.errors.unavailable);
        return;
      }
      setTariff(tariffOn(tariffs.tariffs, lisbonToday()));
      setMeters(energy.meters);
      if (deviceList.ok) setDevices(deviceList.devices);
      setOffers(file ? file.offers : 'none');
      setMeter(busiestMeter(energy.meters));
    });
    return () => {
      active = false;
    };
  }, [range, signOut]);

  useEffect(() => {
    if (!meter) return;
    let active = true;
    void fetchQuarterEnergy(meter, range.from, range.to).then((outcome) => {
      if (!active) return;
      if (outcome.ok) setLoaded({ meter, quarters: outcome.quarters });
      else if (outcome.reason === 'unauthenticated') signOut();
      else setError(t.errors.unavailable);
    });
    return () => {
      active = false;
    };
  }, [meter, range, signOut]);

  const quarters = loaded?.meter === meter ? loaded.quarters : null;
  const usage = useMemo(
    () => (quarters && tariff ? annualUsage(quarters, tariff.periodsMap) : null),
    [quarters, tariff],
  );
  const comparison = useMemo(() => {
    if (!usage || !tariff || !Array.isArray(offers)) return null;
    const chosen = offers.filter(
      (offer) =>
        (!filters.noLoyalty || !offer.loyalty) &&
        (!filters.noServices || offer.servicesPerYearWithVat === 0),
    );
    return compareOffers({ usage, current: tariff, offers: chosen, today: lisbonToday() });
  }, [usage, tariff, offers, filters.noLoyalty, filters.noServices]);

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
  if (tariff === undefined || meters === null) {
    return (
      <>
        {header}
        <p className="hint">{t.loading}</p>
      </>
    );
  }
  if (tariff === null) {
    return (
      <>
        {header}
        <p>
          {texts.noTariff} <Link to="/definicoes">{texts.toSettings}</Link>
        </p>
      </>
    );
  }
  if (meters.length === 0) {
    return (
      <>
        {header}
        <p>
          {texts.noData} <Link to="/definicoes">{texts.toSettings}</Link>
        </p>
      </>
    );
  }

  const results = (comparison?.results ?? []).filter(
    (result) => filters.option === 'all' || result.option === filters.option,
  );
  const split = usage?.byCycle.daily;

  return (
    <>
      {header}

      <section className="card form">
        <h2>{texts.usageTitle}</h2>
        {meters.length > 1 && (
          <label>
            {texts.meter}
            <select value={meter ?? ''} onChange={(event) => setMeter(event.target.value)}>
              {meters.map((item) => (
                <option key={item.meter} value={item.meter}>
                  {meterLabel(item.meter, devices)}
                </option>
              ))}
            </select>
          </label>
        )}
        {!quarters && <p className="hint">{t.loading}</p>}
        {quarters && !usage && <p>{texts.tooLittle}</p>}
        {usage && split && (
          <>
            <p className="big">{texts.perYear(formatKwh(usage.totalWh, 0))}</p>
            <p className="hint">
              {usage.extrapolated
                ? texts.extrapolated(usage.days)
                : texts.fullYear(meterLabel(meter ?? '', devices))}
            </p>
            <p className="hint">
              {texts.split(
                Math.round((split.empty * 100) / usage.totalWh),
                Math.round((split.full * 100) / usage.totalWh),
                Math.round((split.peak * 100) / usage.totalWh),
              )}
            </p>
          </>
        )}
      </section>

      {offers === 'none' && <p className="error">{texts.noOffers}</p>}

      {comparison && (
        <>
          <section className="card form">
            <h2>{texts.currentTitle}</h2>
            <p className="big">{texts.perYearCost(formatCents(comparison.currentCents))}</p>
            <p className="hint">
              {texts.currentHint(
                tariff.supplier ?? texts.yourContract,
                t.settings.tariff.options[tariff.option],
                formatKva(tariff.powerVa),
              )}
            </p>
          </section>

          <section className="card form">
            <h2>{texts.offersTitle}</h2>
            <div className="filters">
              <label>
                {texts.option}
                <select
                  value={filters.option}
                  onChange={(event) => setFilters({ ...filters, option: event.target.value })}
                >
                  <option value="all">{texts.allOptions}</option>
                  <option value="simple">{t.settings.tariff.options.simple}</option>
                  <option value="bi">{t.settings.tariff.options.bi}</option>
                  <option value="tri">{t.settings.tariff.options.tri}</option>
                </select>
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={filters.noLoyalty}
                  onChange={(event) => setFilters({ ...filters, noLoyalty: event.target.checked })}
                />
                {texts.noLoyalty}
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={filters.noServices}
                  onChange={(event) => setFilters({ ...filters, noServices: event.target.checked })}
                />
                {texts.noServices}
              </label>
            </div>
            <p className="hint">{texts.count(results.length)}</p>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{texts.colOffer}</th>
                    <th>{texts.colOption}</th>
                    <th className="number">{texts.colYear}</th>
                    <th className="number">{texts.colSaving}</th>
                  </tr>
                </thead>
                <tbody>
                  {results.slice(0, SHOWN).map((result) => (
                    <tr key={`${result.offer.id}:${result.option}`}>
                      <td>
                        <strong>{result.offer.supplier}</strong>
                        <br />
                        {result.offer.links.offer ? (
                          <a href={result.offer.links.offer} rel="noreferrer" target="_blank">
                            {result.offer.name}
                          </a>
                        ) : (
                          result.offer.name
                        )}
                        {(result.offer.loyalty ||
                          result.offer.servicesPerYearWithVat > 0 ||
                          result.offer.indexedPrices ||
                          result.offer.supply === 'DUAL') && (
                          <span className="hint">
                            {' · '}
                            {[
                              result.offer.supply === 'DUAL' && texts.tagDual,
                              result.offer.loyalty && texts.tagLoyalty,
                              result.offer.servicesPerYearWithVat > 0 && texts.tagServices,
                              result.offer.indexedPrices && texts.tagIndexed,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        )}
                      </td>
                      <td>{optionLabel(result)}</td>
                      <td className="number">{formatCents(result.annualCents)}</td>
                      <td className={result.savingCents > 0 ? 'number success' : 'number'}>
                        {formatCents(result.savingCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card form">
            <h2>{texts.shiftTitle}</h2>
            <p className="hint">{texts.shiftIntro}</p>
            <ul>
              <ShiftLine option="bi" shift={comparison.shift.bi} />
              <ShiftLine option="tri" shift={comparison.shift.tri} />
            </ul>
          </section>

          <section className="card">
            <ul className="hint caveats">
              {texts.caveats.map((caveat) => (
                <li key={caveat}>{caveat}</li>
              ))}
            </ul>
          </section>
        </>
      )}
    </>
  );
}
