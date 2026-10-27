// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * "Tarifários": the last 12 months of real consumption priced with every ERSE
 * offer at the contracted power, against the current contract, and how much
 * would have to move to the empty period for bi- or tri-hourly to pay off.
 * Calculation: src/domain/compare.ts.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  annualUsage,
  compareOffers,
  costWithMoved,
  type AnnualUsage,
  type Comparison,
  type OfferResult,
  type EnergyAdjust,
  type Shift,
} from '../domain/compare';
import type { Cycle, MeterPeriod, TariffInput } from '../domain/tariff';
import type { RecentAppliances } from '../nilm/recent';
import type { HouseholdEnergy } from './household-energy';
import { useRecentAppliances } from './use-recent-appliances';
import type { Offer } from '../domain/erse';
import { dynamicAdjust, indexedKind, profileEffect, type ProfileEffect } from '../domain/indexed';
import type { OmieFile } from '../domain/omie';
import { HowItWorks } from '../components/HowItWorks';
import { t } from '../i18n/pt-PT';
import { formatCents, formatPricePerKwh, omieToMicro } from '../lib/money';
import { lisbonToday } from '../lib/time';
import { formatKva, formatKwh } from '../lib/units';
import { fetchOffers, fetchOmie } from './api';
import { lastYear, useHouseholdEnergy } from './household-energy';
import { meterLabel } from './meters';
import { MeterSelect } from './MeterSelect';

const texts = t.tariffs;
const SHOWN = 15;

const optionLabel = (result: OfferResult) =>
  result.option === 'simple'
    ? t.settings.tariff.options.simple
    : `${t.settings.tariff.options[result.option]} · ${t.settings.tariff.cycles[result.cycle].toLowerCase()}`;

/** Wh per year in each meter period of a cycle, from the recent days' machines. */
function machinesPerYear(recent: RecentAppliances, cycle: Cycle): Record<MeterPeriod, number> {
  const days = recent.days.length;
  const sum = { empty: 0, full: 0, peak: 0 };
  for (const item of recent.appliances) {
    if (!item.shiftable || !item.periods) continue;
    for (const period of ['empty', 'full', 'peak'] as const)
      sum[period] += item.periods[cycle][period];
  }
  const year = (wh: number) => (days === 0 ? 0 : Math.round((wh * 365) / days));
  return { empty: year(sum.empty), full: year(sum.full), peak: year(sum.peak) };
}

/** "Tarifários": what bi- or tri-hourly would cost with the machines the app recognised in empty. */
function Machines({
  comparison,
  usage,
  tariff,
  energy,
  adjust,
}: {
  comparison: Comparison;
  usage: AnnualUsage;
  tariff: TariffInput;
  energy: HouseholdEnergy;
  adjust: EnergyAdjust | undefined;
}) {
  const { active, recent } = useRecentAppliances(energy);
  if (active && !recent) return null;
  const machines = recent?.appliances.filter((item) => item.shiftable && item.periods) ?? [];
  if (!recent || machines.length === 0) return <p className="hint">{texts.machinesNone}</p>;
  const names = machines.map((item) => item.label).join(', ');
  const daily = machinesPerYear(recent, 'daily');
  const outside = daily.full + daily.peak;
  // Under 1 kWh a year outside the empty period: nothing to move.
  if (outside < 1000) return <p>{texts.machinesAlready(names)}</p>;
  return (
    <>
      <h3>{texts.machinesTitle}</h3>
      <p>{texts.machinesIntro(names, formatKwh(outside, 0), recent.days.length)}</p>
      <ul>
        {(['bi', 'tri'] as const).map((option) => {
          const shift = comparison.shift[option];
          if (!shift) return null;
          const cents = costWithMoved(
            shift,
            usage,
            tariff,
            machinesPerYear(recent, shift.best.cycle),
            adjust,
          );
          if (cents === null) return null;
          const difference = comparison.currentCents - cents;
          return (
            <li key={option}>
              {texts.machinesLine(
                t.settings.tariff.options[option],
                shift.best.offer.supplier,
                formatCents(cents),
                formatCents(Math.abs(difference)),
                difference > 0,
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

const MONTH = new Intl.DateTimeFormat('pt-PT', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthName = (month: string) => MONTH.format(new Date(`${month}-15T12:00:00Z`));
const perKwh = (centsPerMwh: number) => formatPricePerKwh(omieToMicro(centsPerMwh));

/** "Tarifários": what the hours the household consumes mean for the offers indexed to the OMIE. */
function Indexed({ effect, offers }: { effect: ProfileEffect; offers: readonly Offer[] }) {
  const words = texts.indexed;
  const pct = effect.average > 0 ? Math.round((effect.weighted / effect.average - 1) * 100) : 0;
  const weighted = perKwh(effect.weighted);
  const average = perKwh(effect.average);
  const dynamic = [
    ...new Set(
      offers.filter((offer) => indexedKind(offer) === 'dynamic').map((offer) => offer.supplier),
    ),
  ];
  const sorted = [...effect.months].sort((a, b) => a.average - b.average);
  const low = sorted[0];
  const high = sorted.at(-1);
  return (
    <section className="card form">
      <h2>{words.title}</h2>
      <p>
        {pct > 1
          ? words.dearer(weighted, pct, average)
          : pct < -1
            ? words.cheaper(weighted, -pct, average)
            : words.same(weighted, average)}
      </p>
      {low && high && effect.months.length > 1 && (
        <p>
          {words.months(
            perKwh(low.average),
            monthName(low.month),
            perKwh(high.average),
            monthName(high.month),
          )}
        </p>
      )}
      <HowItWorks>
        <ul className="hint caveats">
          <li>{words.how}</li>
          {dynamic.length > 0 && <li>{words.dynamic(dynamic.join(', '))}</li>}
          <li>{words.others}</li>
          <li>{words.losses}</li>
          <li>{words.source}</li>
        </ul>
      </HowItWorks>
    </section>
  );
}

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
  const [omie, setOmie] = useState<OmieFile | null>(null);
  const [filters, setFilters] = useState({ option: 'all', noLoyalty: false, noServices: false });

  useEffect(() => {
    let active = true;
    void fetchOffers().then((file) => {
      if (active) setOffers(file ? file.offers : 'none');
    });
    // Without the OMIE prices, indexed offers keep the ERSE estimate.
    void fetchOmie().then((file) => {
      if (active) setOmie(file);
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
  const effect = useMemo(
    () => (quarters && tariff && omie ? profileEffect(quarters, omie, tariff.periodsMap) : null),
    [quarters, tariff, omie],
  );
  const adjust = useMemo(() => dynamicAdjust(effect), [effect]);
  const comparison = useMemo(() => {
    if (!usage || !tariff || !Array.isArray(offers)) return null;
    const chosen = offers.filter(
      (offer) =>
        (!filters.noLoyalty || !offer.loyalty) &&
        (!filters.noServices || offer.servicesPerYearWithVat === 0),
    );
    return compareOffers({ usage, current: tariff, offers: chosen, today: lisbonToday(), adjust });
  }, [usage, tariff, offers, filters.noLoyalty, filters.noServices, adjust]);

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
          {texts.noTariff} <Link to="/definicoes#tarifario">{texts.toSettings}</Link>
        </p>
      </>
    );
  }
  if (meters.length === 0) {
    return (
      <>
        {header}
        <p>
          {texts.noData} <Link to="/definicoes#dados">{texts.toSettings}</Link>
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
      {comparison && (
        <section className="card form">
          {comparison.results[0] && comparison.results[0].savingCents > 0 ? (
            <p className="verdict success">
              {texts.verdictBetter(
                formatCents(comparison.results[0].savingCents),
                comparison.results[0].offer.name,
                comparison.results[0].offer.supplier,
              )}
            </p>
          ) : (
            <p className="verdict">{texts.verdictBest}</p>
          )}
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
      )}

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
                : texts.fullYear(meterLabel(meter ?? '', devices, energy.houseShelly))}
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
              <table className="table stacked">
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
                              result.offer.indexedPrices &&
                                (result.adjusted
                                  ? texts.tagDynamic
                                  : indexedKind(result.offer) === 'average'
                                    ? texts.tagAverage
                                    : texts.tagIndexed),
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        )}
                      </td>
                      <td className="stacked-sub">{optionLabel(result)}</td>
                      <td className="number" data-label={texts.colYear}>
                        {formatCents(result.annualCents)}
                      </td>
                      <td
                        className={result.savingCents > 0 ? 'number success' : 'number'}
                        data-label={texts.colSaving}
                      >
                        {formatCents(result.savingCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {effect && Array.isArray(offers) && <Indexed effect={effect} offers={offers} />}

          <section className="card form">
            <h2>{texts.shiftTitle}</h2>
            <p className="hint">{texts.shiftIntro}</p>
            <ul>
              <ShiftLine option="bi" shift={comparison.shift.bi} />
              <ShiftLine option="tri" shift={comparison.shift.tri} />
            </ul>
            {usage && (
              <Machines
                comparison={comparison}
                usage={usage}
                tariff={tariff}
                energy={energy}
                adjust={adjust}
              />
            )}
          </section>

          <section className="card">
            <HowItWorks>
              <ul className="hint caveats">
                {texts.caveats.map((caveat) => (
                  <li key={caveat}>{caveat}</li>
                ))}
              </ul>
            </HowItWorks>
          </section>
        </>
      )}
    </>
  );
}
