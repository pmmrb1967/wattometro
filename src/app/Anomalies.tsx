// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Unusual days (src/ml/anomalies.ts): yesterday on "Agora" when it was one, and
 * the recent ones on "Consumo". The temperature counts only when the
 * installation follows the weather (use-weather.ts).
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { addDays } from '../domain/consumption';
import { anomalyFacts } from '../ai/tools/energy-tools';
import { HowItWorks } from '../components/HowItWorks';
import { t } from '../i18n/pt-PT';
import { formatCents } from '../lib/money';
import { lisbonToday, type LocalDate } from '../lib/time';
import { formatKwh } from '../lib/units';
import {
  RECENT_ANOMALY_DAYS,
  recentAnomalies,
  REFERENCE_DAYS,
  type Anomaly,
} from '../ml/anomalies';
import { ExplainButton } from './Explain';
import { useWeather } from './use-weather';
import type { HouseholdEnergy } from './household-energy';

const texts = t.anomalies;
const LIST_DAYS = RECENT_ANOMALY_DAYS;
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
    return recentAnomalies(quarters, tariff, weather.daily, today);
  }, [quarters, tariff, weather, today]);
}

/** "Sobretudo das 19 h às 22 h.", "… da meia-noite às 7 h.", or the whole day. */
function spanText(span: NonNullable<Anomaly['span']>): string {
  if (span.from === 0 && span.to === 24) return texts.wholeDay;
  return texts.mostly(texts.span(span.from, span.to));
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
      {anomaly.span && ` ${spanText(anomaly.span)}`}
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
      <ExplainButton subject="unusualDay" facts={() => anomalyFacts(latest)} />
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
              <ExplainButton subject="unusualDay" facts={() => anomalyFacts(anomaly)} />
            </li>
          ))}
        </ul>
      )}
      <HowItWorks>
        <ul className="hint caveats">
          <li>{texts.method(REFERENCE_DAYS)}</li>
          {anomalies.some((anomaly) => anomaly.temperatureMatched) && <li>{texts.temperature}</li>}
        </ul>
      </HowItWorks>
    </section>
  );
}
