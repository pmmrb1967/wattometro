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
import { t } from '../i18n/pt-PT';
import { formatCents } from '../lib/money';
import { lisbonToday } from '../lib/time';
import { formatKva, formatKwh } from '../lib/units';
import { fetchOffers } from './api';
import { lastYear, useHouseholdEnergy } from './household-energy';
import { meterLabel } from './meters';
import { MeterSelect } from './MeterSelect';

const texts = t.tariffs;
const SHOWN = 15;

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
  const energy = useHouseholdEnergy();
  const { window, tariff, meters, devices, meter } = energy;
  const error = energy.error ?? (energy.tariffsFailed ? t.errors.unavailable : null);
  const [offers, setOffers] = useState<Offer[] | null | 'none'>(null);
  const [filters, setFilters] = useState({ option: 'all', noLoyalty: false, noServices: false });

  useEffect(() => {
    let active = true;
    void fetchOffers().then((file) => {
      if (active) setOffers(file ? file.offers : 'none');
    });
    return () => {
      active = false;
    };
  }, []);

  // The last 365 days (the window starts earlier, for the monthly report).
  const all = energy.quarters;
  const quarters = useMemo(() => (all ? lastYear(all, window) : null), [all, window]);
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
        <MeterSelect energy={energy} label={texts.meter} />
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
