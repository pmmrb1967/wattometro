// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * "Potência": the lowest contracted power that would not have tripped in the
 * last 90 days (the per-second retention), the saving on the fixed term, and
 * the moments closest to the limit. Calculation: src/domain/contracted-power.ts.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
  annualFixedCents,
  DEFAULT_MARGIN_PCT,
  decodePeaks,
  offerFixedPerDay,
  recommendTier,
  SINGLE_PHASE,
  type Recommendation,
  type TierEvaluation,
} from '../domain/contracted-power';
import type { Offer } from '../domain/erse';
import { tariffOn, type Tariff } from '../domain/tariff';
import { t } from '../i18n/pt-PT';
import { formatCents, microToPtInput, parsePtPrice, type MicroEuros } from '../lib/money';
import { formatLisbonDateTime, lisbonToday } from '../lib/time';
import { formatKva, formatPower } from '../lib/units';
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

type MeterData = PowerData['meters'][number];

function meterName(meter: string, devices: PowerData['devices']): string {
  const [deviceId, channel] = meter.split(':');
  const name = devices.find((device) => device.id === deviceId)?.name ?? deviceId ?? meter;
  return channel && channel !== '0' ? `${name} · ${t.now.channel(Number(channel))}` : name;
}

/** Highest one-second power of the period: apparent where known, else active. */
const peakOf = (meter: MeterData) => Math.max(meter.apparentMaxVa ?? 0, meter.activeOnlyMaxW ?? 0);

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

function Saving({ tariff, targetVa }: { tariff: Tariff; targetVa: number }) {
  const [offers, setOffers] = useState<Offer[] | null | 'none'>(null);
  const [typed, setTyped] = useState('');

  useEffect(() => {
    let active = true;
    void fetchOffers().then((file) => {
      if (active) setOffers(file ? file.offers : 'none');
    });
    return () => {
      active = false;
    };
  }, []);

  if (offers === null) return <p className="hint">{t.loading}</p>;
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
      <h3>{texts.savingTitle}</h3>
      {saving !== null && (
        <>
          <p className="big">{texts.saving(formatCents(saving))}</p>
          <p className="hint">{texts.savingHint}</p>
        </>
      )}
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
      {tariff.powerVa > VAT_POWER_LIMIT_VA && targetVa <= VAT_POWER_LIMIT_VA && (
        <p className="hint">{texts.vatNote}</p>
      )}
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
      <div className="form">
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
      </div>
      {tariff ? (
        <p>{texts.current(formatKva(tariff.powerVa))}</p>
      ) : (
        <p className="hint">
          <Link to="/definicoes">{texts.noTariff}</Link>
        </p>
      )}

      {failed && <p className="error">{t.errors.unavailable}</p>}
      {!failed && recommendation === null && <p className="hint">{texts.computing}</p>}
      {recommendation && (
        <>
          {recommendedVa === null ? (
            <p className="error">{texts.tooHigh}</p>
          ) : (
            <p className="big">{texts.recommendedValue(formatKva(recommendedVa))}</p>
          )}
          {tariff && recommendedVa !== null && recommendedVa === tariff.powerVa && (
            <p className="success">{texts.same}</p>
          )}
          {tariff && recommendedVa !== null && recommendedVa > tariff.powerVa && (
            <p className="error">{texts.higher}</p>
          )}
          {tariff && recommendedVa !== null && recommendedVa < tariff.powerVa && (
            <>
              <p className="success">{texts.lower}</p>
              <Saving tariff={tariff} targetVa={recommendedVa} />
            </>
          )}

          {recommendation.evaluations.length > 0 && (
            <>
              <h3>{texts.tiersTitle}</h3>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{texts.tierColumns.tier}</th>
                      <th>{texts.tierColumns.result}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recommendation.evaluations.map((evaluation) => (
                      <tr key={evaluation.tierVa}>
                        <td>{formatKva(evaluation.tierVa)}</td>
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
          {estimated > 0 && <p className="hint">{texts.estimated(estimated)}</p>}
        </>
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
            {meter.top.map((quarter) => (
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
            <p className="error">{texts.eredesOnly(formatPower(data.eredes.maxEnergyWh * 4))}</p>
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
          <TopSection meter={meter} tariff={tariff} />
        </>
      )}

      <section className="card">
        <ul className="hint caveats">
          {texts.caveats.map((caveat) => (
            <li key={caveat}>{caveat}</li>
          ))}
        </ul>
      </section>
    </>
  );
}
