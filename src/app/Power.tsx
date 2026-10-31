// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * "Potência": the lowest contracted power that would not have tripped in the
 * last 90 days (the per-second retention), the saving on the fixed term, the
 * times the meter started counting towards a cut at the current contract, and
 * the moments closest to the limit. Calculation: src/domain/contracted-power.ts.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
  annualFixedCents,
  DEFAULT_MARGIN_PCT,
  periodPeak,
  decodePeaks,
  nearTripEpisodes,
  offerFixedPerDay,
  samplesOf,
  recommendTier,
  SINGLE_PHASE,
  tripSeconds,
  tripThreshold,
  type NearTripEpisode,
  type Recommendation,
  type TierEvaluation,
} from '../domain/contracted-power';
import type { Offer } from '../domain/erse';
import { tariffOn, type Tariff } from '../domain/tariff';
import { HowItWorks } from '../components/HowItWorks';
import { AddShellyLink } from './AddShellyLink';
import { PowerDayChart } from './PowerDayChart';
import { t } from '../i18n/pt-PT';
import { formatCents, microToPtInput, parsePtPrice, type MicroEuros } from '../lib/money';
import { formatLisbonDateTime, lisbonToday } from '../lib/time';
import { formatKva, formatPower } from '../lib/units';
import { InfoTip } from '../components/InfoTip';
import {
  fetchOffers,
  fetchPeakRecords,
  fetchPower,
  fetchTariffs,
  type Power as PowerData,
} from './api';
import { useSession } from './session';

const texts = t.power;
const PERIOD_DAYS = 90;
const DAY = 86_400;
const VAT_POWER_LIMIT_VA = 6900;
/** Episodes shown: those that reached at least this share of the time to trip. */
const SHOWN_PROGRESS_PCT = 50;

type MeterData = PowerData['meters'][number];

/** Multiples of the contracted power shown in "Quando o contador corta". */
const RULE_RATIOS = [1.2, 1.5, 2, 3];
const RATIO = new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 1 });
/** Without a tariff, the most common contract as the example. */
const EXAMPLE_VA = 6900;

/** The trip rule itself, with the household's contract (or an example). */
function TripRuleSection({ contractVa }: { contractVa: number | null }) {
  const rule = texts.tripRule;
  const va = contractVa ?? EXAMPLE_VA;
  return (
    <section className="card">
      <h2>{rule.title}</h2>
      <p>{rule.intro(RATIO.format(SINGLE_PHASE.k), String(SINGLE_PHASE.q))}</p>
      <p>{contractVa === null ? rule.example(formatKva(va)) : rule.forContract(formatKva(va))}</p>
      <table className="table">
        <thead>
          <tr>
            <th>{rule.columns.power}</th>
            <th>{rule.columns.time}</th>
          </tr>
        </thead>
        <tbody>
          {RULE_RATIOS.map((ratio) => {
            const demand = Math.round(va * ratio);
            const seconds = tripSeconds(demand, va, SINGLE_PHASE);
            return (
              <tr key={ratio}>
                <td>
                  {ratio === SINGLE_PHASE.k ? '≤ ' : ''}
                  {rule.times(formatKva(demand), RATIO.format(ratio))}
                </td>
                <td>
                  {seconds === null ? rule.never : texts.nearTrip.duration(Math.round(seconds))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="hint">{rule.threePhase}</p>
      <p className="hint">{rule.source}</p>
    </section>
  );
}

/** The highest quarter hours shown: the first few say it (the rest are alike). */
const TOP_SHOWN = 5;

function meterName(meter: string, devices: PowerData['devices']): string {
  const [deviceId, channel] = meter.split(':');
  const name = devices.find((device) => device.id === deviceId)?.name ?? deviceId ?? meter;
  return channel && channel !== '0' ? `${name} · ${t.now.channel(Number(channel))}` : name;
}

const peakOf = (meter: MeterData) => periodPeak(meter);

function tierResult(evaluation: TierEvaluation): string {
  const simulation = evaluation.simulation;
  switch (evaluation.status) {
    case 'clear':
      return texts.clear;
    case 'unknown':
      return texts.unknown;
    case 'safe':
      return simulation?.closest
        ? texts.safe(simulation.closest.progressPct, formatLisbonDateTime(simulation.closest.ts))
        : texts.clear;
    case 'trips': {
      const first = simulation?.trips[0];
      return first
        ? texts.trips(simulation.trips.length, formatLisbonDateTime(first.ts), formatKva(first.va))
        : texts.unknown;
    }
  }
}

/** The ERSE offers, for the fixed term at other tiers: null while loading, 'none' without them. */
function useOffers(): Offer[] | null | 'none' {
  const [offers, setOffers] = useState<Offer[] | null | 'none'>(null);
  useEffect(() => {
    let active = true;
    void fetchOffers().then((file) => {
      if (active) setOffers(file ? file.offers : 'none');
    });
    return () => {
      active = false;
    };
  }, []);
  return offers;
}

/** What a tier costs more (positive) or saves (negative) a year, by the ERSE price; null without one. */
function tierDifference(offers: Offer[] | null | 'none', tariff: Tariff, tierVa: number) {
  if (tierVa === tariff.powerVa) return 0;
  if (offers === null || offers === 'none') return null;
  const match = offerFixedPerDay(offers, tariff, tierVa);
  if (!match) return null;
  return (
    annualFixedCents(tariff, tierVa, match.fixedPerDay) -
    annualFixedCents(tariff, tariff.powerVa, tariff.fixedPerDay)
  );
}

function TierPerYear({
  offers,
  tariff,
  tierVa,
}: {
  offers: Offer[] | null | 'none';
  tariff: Tariff;
  tierVa: number;
}) {
  if (tierVa === tariff.powerVa) return <>{texts.tierCurrent}</>;
  const difference = tierDifference(offers, tariff, tierVa);
  if (difference === null) return <>{texts.tierNoPrice}</>;
  return difference <= 0 ? (
    <span className="success">{texts.tierSaves(formatCents(-difference))}</span>
  ) : (
    <>{texts.tierCosts(formatCents(difference))}</>
  );
}

/** ERSE's steps to change the contracted power (docs/contracted-power.md). */
function ChangeSteps() {
  const change = texts.change;
  return (
    <>
      <h3>{change.title}</h3>
      <ol className="steps">
        {change.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <p className="hint">{change.source}</p>
    </>
  );
}

/** The verdict, its reason behind an (i), and on the right what it is worth a year. */
function VerdictRow({
  verdict,
  why,
  amount,
  error = false,
}: {
  verdict: string;
  why: string;
  amount?: string | null;
  error?: boolean;
}) {
  return (
    <div className="verdict-row">
      <p className={error ? 'verdict has-info error' : 'verdict has-info'}>
        {verdict}
        <InfoTip text={why} inline />
      </p>
      {amount && (
        <p className="verdict-amount has-info success">
          {texts.saving(amount)}
          <InfoTip text={texts.savingHint} inline />
        </p>
      )}
    </div>
  );
}

function Saving({
  tariff,
  targetVa,
  offers,
}: {
  tariff: Tariff;
  targetVa: number;
  offers: Offer[] | null | 'none';
}) {
  const [typed, setTyped] = useState('');

  const verdict = texts.verdictLower(formatKva(tariff.powerVa), formatKva(targetVa));
  if (offers === null) {
    return <VerdictRow verdict={verdict} why={texts.verdictLowerWhy} />;
  }
  const match = offers === 'none' ? null : offerFixedPerDay(offers, tariff, targetVa);
  const typedPrice: MicroEuros | null = typed.trim() === '' ? null : parsePtPrice(typed);
  const price = typedPrice ?? match?.fixedPerDay ?? null;
  const saving =
    price === null
      ? null
      : annualFixedCents(tariff, tariff.powerVa, tariff.fixedPerDay) -
        annualFixedCents(tariff, targetVa, price);

  return (
    <div className="form">
      <VerdictRow
        verdict={verdict}
        why={texts.verdictLowerWhy}
        amount={saving === null ? null : formatCents(saving)}
      />
      {tariff.powerVa > VAT_POWER_LIMIT_VA && targetVa <= VAT_POWER_LIMIT_VA && (
        <p className="hint">{texts.vatNote}</p>
      )}
      {/* Without a price from the ERSE offers, the field is the only way to a saving: open. */}
      <details className="adjust" open={!match}>
        <summary>{texts.otherPrice}</summary>
        {match && typedPrice === null && (
          <p className="hint">{texts.priceFrom(match.offer.name, match.offer.supplier)}</p>
        )}
        {!match && <p className="hint">{texts.priceMissing}</p>}
        <label>
          {texts.priceLabel(formatKva(targetVa))}
          <input
            inputMode="decimal"
            autoComplete="off"
            value={typed}
            placeholder={match ? microToPtInput(match.fixedPerDay) : '0,0000'}
            onChange={(event) => setTyped(event.target.value)}
          />
        </label>
      </details>
    </div>
  );
}

function RecommendationSection({
  meter,
  from,
  to,
  tariff,
}: {
  meter: MeterData;
  from: number;
  to: number;
  tariff: Tariff | null;
}) {
  const { signOut } = useSession();
  const offers = useOffers();
  const [margin, setMargin] = useState(DEFAULT_MARGIN_PCT);
  const [result, setResult] = useState<{ key: string; recommendation: Recommendation } | null>(
    null,
  );
  const [failed, setFailed] = useState(false);
  const key = `${meter.meter}:${margin}:${from}`;

  useEffect(() => {
    let active = true;
    void recommendTier({
      peak: peakOf(meter),
      marginPct: margin,
      curve: SINGLE_PHASE,
      fetchPeaks: async (threshold) => {
        const outcome = await fetchPeakRecords(meter.meter, from, to, threshold);
        if (!outcome.ok) {
          if (outcome.reason === 'unauthenticated') signOut();
          throw new Error(outcome.reason);
        }
        return { minutes: decodePeaks(outcome.records), truncated: outcome.truncated };
      },
    }).then(
      (recommendation) => {
        if (active) setResult({ key, recommendation });
      },
      () => {
        if (active) setFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [key, meter, margin, from, to, signOut]);

  const recommendation = result?.key === key ? result.recommendation : null;
  const recommendedVa = recommendation?.recommendedVa ?? null;
  const estimated =
    recommendation?.evaluations.reduce((sum, e) => sum + e.estimatedMinutes, 0) ?? 0;

  return (
    <section className="card">
      <h2>{texts.recommended}</h2>
      {meter.apparentMaxVa !== null && meter.activeMaxW !== null && (
        <p className="has-info">
          {texts.peakLine(formatKva(meter.apparentMaxVa), formatPower(meter.activeMaxW))}
          <InfoTip text={texts.peakInfo} inline />
        </p>
      )}
      {!tariff && (
        <p className="hint">
          <Link to="/definicoes#tarifario">{texts.noTariff}</Link>
        </p>
      )}

      {failed && <p className="error">{t.errors.unavailable}</p>}
      {!failed && recommendation === null && <p className="hint">{texts.computing}</p>}
      {recommendation && (
        <>
          {recommendedVa === null ? (
            <p className="error">{texts.tooHigh}</p>
          ) : !tariff ? (
            <p className="big">{formatKva(recommendedVa)}</p>
          ) : recommendedVa < tariff.powerVa ? (
            <Saving tariff={tariff} targetVa={recommendedVa} offers={offers} />
          ) : recommendedVa === tariff.powerVa ? (
            <VerdictRow
              verdict={texts.verdictSame(formatKva(tariff.powerVa))}
              why={texts.verdictSameWhy}
            />
          ) : (
            <VerdictRow
              verdict={texts.verdictHigher(formatKva(tariff.powerVa), formatKva(recommendedVa))}
              why={texts.verdictHigherWhy(formatKva(tariff.powerVa))}
              error
            />
          )}

          {recommendation.evaluations.length > 0 && (
            <>
              <h3>{texts.tiersTitle}</h3>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{texts.tierColumns.tier}</th>
                      {tariff && <th>{texts.tierColumns.perYear}</th>}
                      <th>{texts.tierColumns.result}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recommendation.evaluations.map((evaluation) => (
                      <tr key={evaluation.tierVa}>
                        <td>{formatKva(evaluation.tierVa)}</td>
                        {tariff && (
                          <td>
                            <TierPerYear
                              offers={offers}
                              tariff={tariff}
                              tierVa={evaluation.tierVa}
                            />
                          </td>
                        )}
                        <td className={evaluation.status === 'trips' ? 'error' : undefined}>
                          {tierResult(evaluation)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {tariff && recommendation.evaluations.length > 1 && (
            <p className="hint">{texts.perYearHint}</p>
          )}
          {estimated > 0 && <p className="hint">{texts.estimated(estimated)}</p>}
          {tariff && recommendedVa !== null && recommendedVa !== tariff.powerVa && <ChangeSteps />}
        </>
      )}
      <details className="adjust form">
        <summary>{texts.adjustMargin(margin)}</summary>
        <label>
          {texts.margin}
          <input
            type="number"
            min={0}
            max={50}
            value={margin}
            onChange={(event) =>
              setMargin(Math.min(50, Math.max(0, Math.floor(Number(event.target.value)) || 0)))
            }
          />
          <span className="hint">{texts.marginHint}</span>
        </label>
      </details>
    </section>
  );
}

type NearTripState =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'truncated' }
  | { kind: 'done'; episodes: NearTripEpisode[]; estimatedMinutes: number };

function NearTripSection({
  meter,
  from,
  to,
  contractVa,
}: {
  meter: MeterData;
  from: number;
  to: number;
  contractVa: number;
}) {
  const nearTexts = texts.nearTrip;
  const { signOut } = useSession();
  const threshold = tripThreshold(contractVa, 0, SINGLE_PHASE);
  const key = `${meter.meter}:${contractVa}:${from}`;
  const [result, setResult] = useState<{ key: string; state: NearTripState } | null>(null);

  useEffect(() => {
    let active = true;
    const done = (state: NearTripState) => {
      if (active) setResult({ key, state });
    };
    // Below the threshold all along: nothing to fetch.
    if (peakOf(meter) <= threshold) {
      done({ kind: 'done', episodes: [], estimatedMinutes: 0 });
      return;
    }
    void fetchPeakRecords(meter.meter, from, to, threshold).then((outcome) => {
      if (!outcome.ok) {
        if (outcome.reason === 'unauthenticated') signOut();
        done({ kind: 'failed' });
        return;
      }
      if (outcome.truncated) {
        done({ kind: 'truncated' });
        return;
      }
      const { samples, estimatedMinutes } = samplesOf(decodePeaks(outcome.records));
      done({
        kind: 'done',
        episodes: nearTripEpisodes(samples, contractVa, SINGLE_PHASE),
        estimatedMinutes,
      });
    });
    return () => {
      active = false;
    };
  }, [key, meter, from, to, threshold, contractVa, signOut]);

  const state: NearTripState = result?.key === key ? result.state : { kind: 'loading' };
  const shown =
    state.kind === 'done'
      ? state.episodes
          .filter((episode) => episode.tripped || episode.progressPct >= SHOWN_PROGRESS_PCT)
          .sort((a, b) => b.start - a.start)
      : [];
  const closest =
    state.kind === 'done' && state.episodes.length > 0
      ? state.episodes.reduce((best, episode) =>
          episode.progressPct > best.progressPct ? episode : best,
        )
      : null;
  const columns = nearTexts.columns;

  return (
    <section className="card">
      <h2>{nearTexts.title}</h2>
      <p className="hint">{nearTexts.intro(formatKva(threshold), formatKva(contractVa))}</p>
      {state.kind === 'loading' && <p className="hint">{nearTexts.computing}</p>}
      {state.kind === 'failed' && <p className="error">{t.errors.unavailable}</p>}
      {state.kind === 'truncated' && <p className="error">{nearTexts.tooMany}</p>}
      {state.kind === 'done' && state.episodes.length === 0 && (
        <p className="success">{nearTexts.none}</p>
      )}
      {state.kind === 'done' && shown.length === 0 && closest && (
        <p className="success">
          {nearTexts.closest(
            state.episodes.length,
            closest.progressPct,
            formatLisbonDateTime(closest.start),
          )}
        </p>
      )}
      {shown.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{columns.when}</th>
                <th>{columns.duration}</th>
                <th>{columns.peak}</th>
                <th>{columns.progress}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((episode) => (
                <tr key={episode.start}>
                  <td>{formatLisbonDateTime(episode.start)}</td>
                  <td>{nearTexts.duration(episode.seconds)}</td>
                  <td>{formatKva(episode.peakVa)}</td>
                  <td>{episode.tripped ? nearTexts.tripped : `${episode.progressPct} %`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {state.kind === 'done' && state.estimatedMinutes > 0 && (
        <p className="hint">{texts.estimated(state.estimatedMinutes)}</p>
      )}
    </section>
  );
}

function TopSection({ meter, tariff }: { meter: MeterData; tariff: Tariff | null }) {
  const columns = texts.topColumns;
  return (
    <section className="card">
      <h2>{texts.topTitle}</h2>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{columns.when}</th>
              <th>{columns.peak}</th>
              {tariff && <th>{columns.share}</th>}
            </tr>
          </thead>
          <tbody>
            {meter.top.slice(0, TOP_SHOWN).map((quarter) => (
              <tr key={quarter.ts}>
                <td>{formatLisbonDateTime(quarter.ts)}</td>
                <td>
                  {quarter.estimated
                    ? `${formatPower(quarter.peak)} ${texts.topEstimatedMark}`
                    : formatKva(quarter.peak)}
                </td>
                {tariff && <td>{Math.round((quarter.peak * 100) / tariff.powerVa)} %</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {meter.top.some((quarter) => quarter.estimated) && (
        <p className="hint">{texts.topEstimated}</p>
      )}
    </section>
  );
}

export function Power() {
  const { signOut } = useSession();
  const [now] = useState(() => Math.floor(Date.now() / 1000));
  const from = now - PERIOD_DAYS * DAY;
  const [data, setData] = useState<PowerData | null | 'unavailable'>(null);
  const [tariff, setTariff] = useState<Tariff | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetchPower(from, now).then((outcome) => {
      if (!active) return;
      if (outcome.ok) setData(outcome.power);
      else if (outcome.reason === 'unauthenticated') signOut();
      else setData('unavailable');
    });
    void fetchTariffs().then((outcome) => {
      if (active && outcome.ok) setTariff(tariffOn(outcome.tariffs, lisbonToday()));
    });
    return () => {
      active = false;
    };
  }, [from, now, signOut]);

  const meters = data && data !== 'unavailable' ? data.meters : [];
  // The meter with most data is likely the main one (the whole house).
  const busiest = [...meters].sort((a, b) => b.minutes - a.minutes)[0];
  const meter = meters.find((item) => item.meter === chosen) ?? busiest;

  return (
    <>
      <h1>{texts.title}</h1>
      <p className="hint">{texts.intro}</p>

      {data === null && <p className="hint">{t.loading}</p>}
      {data === 'unavailable' && <p className="error">{t.errors.unavailable}</p>}
      {data && data !== 'unavailable' && !meter && (
        <section className="card">
          {data.eredes.quarters > 0 && data.eredes.maxEnergyWh !== null ? (
            <>
              <p>{texts.eredesOnly(formatPower(data.eredes.maxEnergyWh * 4))}</p>
              <p className="hint">
                {texts.eredesShelly} <AddShellyLink>{t.home.eredes.addShelly}</AddShellyLink>
              </p>
            </>
          ) : (
            <p>{texts.noShelly}</p>
          )}
        </section>
      )}
      {data && data !== 'unavailable' && meter && (
        <>
          {meters.length > 1 && (
            <section className="card form">
              <label>
                {texts.meter}
                <select value={meter.meter} onChange={(event) => setChosen(event.target.value)}>
                  {meters.map((item) => (
                    <option key={item.meter} value={item.meter}>
                      {meterName(item.meter, data.devices)}
                    </option>
                  ))}
                </select>
              </label>
            </section>
          )}
          <RecommendationSection meter={meter} from={from} to={now} tariff={tariff} />
          <PowerDayChart meter={meter.meter} tariff={tariff} />
          {tariff ? (
            <NearTripSection meter={meter} from={from} to={now} contractVa={tariff.powerVa} />
          ) : (
            <section className="card">
              <h2>{texts.nearTrip.title}</h2>
              <p className="hint">
                <Link to="/definicoes#tarifario">{texts.nearTrip.noTariff}</Link>
              </p>
            </section>
          )}
          <TopSection meter={meter} tariff={tariff} />
        </>
      )}

      <TripRuleSection contractVa={tariff ? tariff.powerVa : null} />

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
  );
}
