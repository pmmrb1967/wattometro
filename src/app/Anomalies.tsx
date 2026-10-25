// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Unusual days (src/ml/anomalies.ts): yesterday on "Agora" when it was one, and
 * the recent ones on "Consumo". The temperature counts only when the
 * installation follows the weather (use-weather.ts).
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { addDays } from '../domain/consumption';
import { t } from '../i18n/pt-PT';
import { formatCents } from '../lib/money';
import { lisbonToday, type LocalDate } from '../lib/time';
import { formatKwh } from '../lib/units';
import { findAnomalies, REFERENCE_DAYS, type Anomaly } from '../ml/anomalies';
import { prepareForecast } from '../ml/bill-forecast';
import { useWeather } from './use-weather';
import type { HouseholdEnergy } from './household-energy';

const texts = t.anomalies;
/** How far back "Consumo" lists them. */
const LIST_DAYS = 90;
const MAX_LISTED = 10;

const DAY = new Intl.DateTimeFormat('pt-PT', {
  weekday: 'long',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const dayLabel = (date: LocalDate) => DAY.format(new Date(`${date}T12:00:00Z`));

/** The unusual days of the last LIST_DAYS, newest first; undefined while loading. */
function useAnomalies(energy: HouseholdEnergy): Anomaly[] | undefined {
  const [today] = useState(lisbonToday);
  const weather = useWeather(today);
  const { quarters, tariff } = energy;
  return useMemo(() => {
    if (!quarters || !weather || tariff === undefined) return undefined;
    const daily = weather.daily;
    const temperatureOf = daily ? (date: LocalDate) => daily.get(date) ?? null : null;
    return findAnomalies(
      prepareForecast(quarters, tariff),
      addDays(today, -LIST_DAYS),
      temperatureOf,
    ).reverse();
  }, [quarters, tariff, weather, today]);
}

/** "das 19 h às 22 h", "das 19 h à meia-noite". */
function spanText(span: NonNullable<Anomaly['span']>): string {
  return texts.span(span.from, span.to === 24 ? null : span.to);
}

function Sentence({ anomaly, when }: { anomaly: Anomaly; when: string }) {
  const pct = Math.round(
    (Math.abs(anomaly.actualWh - anomaly.expectedWh) * 100) / anomaly.expectedWh,
  );
  return (
    <>
      {texts.sentence(
        when,
        anomaly.direction,
        pct,
        formatKwh(anomaly.actualWh),
        formatKwh(anomaly.expectedWh),
      )}
      {anomaly.span && ` ${texts.mostly(spanText(anomaly.span))}`}
      {anomaly.excessCents !== null &&
        anomaly.excessCents !== 0 &&
        ` ${texts.cost(anomaly.excessCents > 0, formatCents(Math.abs(anomaly.excessCents)))}`}
    </>
  );
}

/** "Agora": yesterday, only when it was unusual. */
export function AnomalyCard({ energy }: { energy: HouseholdEnergy }) {
  const anomalies = useAnomalies(energy);
  const yesterday = addDays(lisbonToday(), -1);
  const latest = anomalies?.[0];
  if (!latest || latest.date !== yesterday) return null;
  return (
    <section className="card">
      <h2>{texts.yesterdayTitle}</h2>
      <p>
        <Sentence anomaly={latest} when={texts.yesterday} />
      </p>
      <p>
        <Link to="/consumo#fora-do-habitual">{texts.more}</Link>
      </p>
    </section>
  );
}

/** "Consumo": the recent unusual days and how they are found. */
export function AnomalyList({ energy }: { energy: HouseholdEnergy }) {
  const anomalies = useAnomalies(energy);
  if (anomalies === undefined) return null;
  return (
    <section className="card form" id="fora-do-habitual">
      <h2>{texts.title}</h2>
      <p className="lead">{texts.intro(LIST_DAYS)}</p>
      {anomalies.length === 0 ? (
        <p>{texts.none(LIST_DAYS)}</p>
      ) : (
        <ul>
          {anomalies.slice(0, MAX_LISTED).map((anomaly) => (
            <li key={anomaly.date}>
              <Sentence anomaly={anomaly} when={dayLabel(anomaly.date)} />
            </li>
          ))}
        </ul>
      )}
      <ul className="hint caveats">
        <li>{texts.method(REFERENCE_DAYS)}</li>
        {anomalies.some((anomaly) => anomaly.temperatureMatched) && <li>{texts.temperature}</li>}
      </ul>
    </section>
  );
}
