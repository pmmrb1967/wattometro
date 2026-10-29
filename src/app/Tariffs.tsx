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
  withoutTwins,
  type ShownOffer,
  compareOffers,
  costWithMoved,
  type AnnualUsage,
  type Comparison,
  type OfferResult,
  type EnergyAdjust,
  type Shift,
} from '../domain/compare';
import type { Cost, EnergyByPeriod } from '../domain/electricity-cost';
import type { BillingPeriod, Cycle, MeterPeriod, TariffInput } from '../domain/tariff';
import type { RecentAppliances } from '../nilm/recent';
import type { HouseholdEnergy } from './household-energy';
import { useRecentAppliances } from './use-recent-appliances';
import type { Offer } from '../domain/erse';
import { dynamicAdjust, indexedKind, profileEffect, type ProfileEffect } from '../domain/indexed';
import type { OmieFile } from '../domain/omie';
import { HowItWorks } from '../components/HowItWorks';
import { t } from '../i18n/pt-PT';
import { formatCents, formatPricePerDay, formatPricePerKwh, omieToMicro } from '../lib/money';
import { lisbonToday } from '../lib/time';
import { formatKva, formatKwh } from '../lib/units';
import { fetchOffers, fetchOmie } from './api';
import { MarketHours } from './MarketHours';
import { lastYear, useHouseholdEnergy } from './household-energy';
import { meterLabel } from './meters';
import { useSession } from './session';
import { MeterSelect } from './MeterSelect';
import { SocialTariff } from './SocialTariff';
import { CarCharging } from './CarCharging';
import { optionLabel } from './offer-label';

const texts = t.tariffs;
/** Offers shown at first, and how many more each "Ver mais" adds. */
const FIRST_SHOWN = 5;
const MORE_SHOWN = 10;

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

/** "Potência: 0,4532 €/dia · Vazio: 0,105 €/kWh · …": the prices, without VAT. */
function PriceLine({
  fixedPerDay,
  energyPrices,
}: {
  fixedPerDay: number;
  energyPrices: Partial<Record<BillingPeriod, number>>;
}) {
  const periods = Object.keys(energyPrices) as BillingPeriod[];
  return (
    <p className="offer-price-line">
      {[
        texts.prices.item(texts.prices.power, formatPricePerDay(fixedPerDay)),
        ...periods.map((period) =>
          texts.prices.item(
            t.settings.tariff.periods[period],
            formatPricePerKwh(energyPrices[period] ?? 0),
          ),
        ),
      ].join(' · ')}
    </p>
  );
}

/** What each part of the bill costs in the year, under "Ver as contas do ano". */
function YearDetails({
  cost,
  energyPrices,
  energy,
  fixedPerDay,
  note,
}: {
  cost: Cost;
  energyPrices: Partial<Record<BillingPeriod, number>>;
  energy: EnergyByPeriod;
  fixedPerDay: number;
  note: string;
}) {
  const prices = texts.prices;
  const periods = Object.keys(energyPrices) as BillingPeriod[];
  return (
    <details className="offer-prices">
      <summary>{prices.toggle}</summary>
      <dl>
        <div>
          <dt>{prices.power}</dt>
          <dd>{formatPricePerDay(fixedPerDay)}</dd>
          <dd>{prices.perYear(formatCents(cost.powerCents))}</dd>
        </div>
        <div>
          <dt>{prices.energy}</dt>
          {periods.map((period) => (
            <dd key={period}>
              {prices.energyLine(
                period === 'simple' ? null : t.settings.tariff.periods[period],
                formatPricePerKwh(energyPrices[period] ?? 0),
                formatKwh(energy[period] ?? 0, 0),
              )}
            </dd>
          ))}
          <dd>{prices.perYear(formatCents(cost.energyCents))}</dd>
        </div>
        <div>
          <dt>{prices.taxes}</dt>
          <dd>{prices.perYear(formatCents(cost.taxesCents))}</dd>
        </div>
        {cost.servicesCents > 0 && (
          <div>
            <dt>{prices.services}</dt>
            <dd>{prices.perYear(formatCents(cost.servicesCents))}</dd>
          </div>
        )}
      </dl>
      <p className="hint">{note}</p>
    </details>
  );
}

/** "€ /ano": the amount large, the unit small. */
function Amount({ cents }: { cents: number }) {
  return (
    <p className="compare-amount">
      {formatCents(cents)}
      <span>{texts.perYearUnit}</span>
    </p>
  );
}

/** What sets an offer apart, as tags: gas, loyalty, services, indexed prices. */
function offerTags(result: OfferResult, alsoGas: boolean): string[] {
  const { offer } = result;
  const tags = texts.tags;
  const list: (string | false)[] = [
    alsoGas ? tags.alsoGas : offer.supply === 'DUAL' && tags.dual,
    offer.loyalty && tags.loyalty,
    offer.servicesPerYearWithVat > 0 && tags.services,
    offer.indexedPrices &&
      (result.adjusted
        ? tags.dynamic
        : indexedKind(offer) === 'average'
          ? tags.average
          : tags.indexed),
  ];
  return list.filter((tag): tag is string => tag !== false);
}

/** One offer: name, supplier and option, the year, the saving, prices, tags and its page. */
function OfferCard({ result, alsoGas }: ShownOffer) {
  const tags = offerTags(result, alsoGas);
  return (
    <li className="offer">
      <div className="offer-head">
        <div>
          <strong>{result.offer.name}</strong>
          <span className="hint">
            {result.offer.supplier} · {optionLabel(result)}
          </span>
        </div>
        <Amount cents={result.annualCents} />
      </div>
      {result.savingCents > 0 ? (
        <p className="offer-saving">{texts.saving(formatCents(result.savingCents))}</p>
      ) : (
        <p className="hint offer-dearer">{texts.dearer(formatCents(-result.savingCents))}</p>
      )}
      <PriceLine fixedPerDay={result.fixedPerDay} energyPrices={result.energyPrices} />
      {tags.length > 0 && (
        <ul className="offer-tags">
          {tags.map((tag) => (
            <li key={tag}>{tag}</li>
          ))}
        </ul>
      )}
      <YearDetails
        cost={result.cost}
        energyPrices={result.energyPrices}
        energy={result.energy}
        fixedPerDay={result.fixedPerDay}
        note={result.adjusted ? `${texts.prices.note} ${texts.prices.adjusted}` : texts.prices.note}
      />
      {result.offer.links.offer && (
        <a className="offer-sheet" href={result.offer.links.offer} rel="noreferrer" target="_blank">
          {texts.sheet}
        </a>
      )}
    </li>
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
  const { me } = useSession();
  const energy = useHouseholdEnergy();
  const { window, tariff, meters, devices, meter } = energy;
  const error = energy.error ?? (energy.tariffsFailed ? t.errors.unavailable : null);
  const [offers, setOffers] = useState<Offer[] | null | 'none'>(null);
  const [omie, setOmie] = useState<OmieFile | null>(null);
  const [filters, setFilters] = useState({ option: 'all', noLoyalty: false, noServices: false });
  const [shown, setShown] = useState(FIRST_SHOWN);

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

  const twinless = withoutTwins(comparison?.results ?? []);
  const results = twinless.filter(
    ({ result }) => filters.option === 'all' || result.option === filters.option,
  );
  const best = twinless[0]?.result;
  const split = usage?.byCycle.daily;

  return (
    <>
      {header}
      {comparison && (
        <section className="card form">
          {best && best.savingCents > 0 ? (
            <p className="verdict success">
              {texts.verdictBetter(
                formatCents(best.savingCents),
                best.offer.name,
                best.offer.supplier,
              )}
            </p>
          ) : (
            <p className="verdict">{texts.verdictBest}</p>
          )}
          <div className="compare-current">
            <h2>{texts.currentTitle}</h2>
            <Amount cents={comparison.currentCents} />
            <p>
              {[
                tariff.supplier ?? texts.yourContract,
                t.settings.tariff.options[tariff.option],
                formatKva(tariff.powerVa),
              ].join(' · ')}
            </p>
            <PriceLine fixedPerDay={tariff.fixedPerDay} energyPrices={tariff.energy} />
            <p className="hint">{texts.currentHint}</p>
            <YearDetails
              cost={comparison.currentCost}
              energyPrices={tariff.energy}
              energy={comparison.currentEnergy}
              fixedPerDay={tariff.fixedPerDay}
              note={texts.prices.currentNote}
            />
          </div>
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
                : texts.fullYear(meterLabel(meter ?? '', devices, me.householdName))}
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
            <ol className="offers">
              {results.slice(0, shown).map(({ result, alsoGas }) => (
                <OfferCard
                  key={`${result.offer.id}:${result.option}`}
                  result={result}
                  alsoGas={alsoGas}
                />
              ))}
            </ol>
            {(results.length > shown || shown > FIRST_SHOWN) && (
              <p className="list-toggle">
                {results.length > shown && (
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => setShown(shown + MORE_SHOWN)}
                  >
                    {texts.showMore(Math.min(MORE_SHOWN, results.length - shown))}
                  </button>
                )}
                {shown > FIRST_SHOWN && (
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => setShown(FIRST_SHOWN)}
                  >
                    {texts.showLess(FIRST_SHOWN)}
                  </button>
                )}
              </p>
            )}
          </section>

          {effect && Array.isArray(offers) && <Indexed effect={effect} offers={offers} />}
          <MarketHours />

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

          {usage && Array.isArray(offers) && (
            <CarCharging usage={usage} tariff={tariff} offers={offers} />
          )}

          <SocialTariff
            tariff={tariff}
            cost={comparison.currentCost}
            energy={comparison.currentEnergy}
          />

          <div className="page-how">
            <HowItWorks>
              <ul className="hint caveats">
                {texts.caveats.map((caveat) => (
                  <li key={caveat}>{caveat}</li>
                ))}
              </ul>
            </HowItWorks>
          </div>
        </>
      )}
    </>
  );
}
