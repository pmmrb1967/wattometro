// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The month's bill before it arrives (src/ml/bill-forecast.ts): a card on the
 * "Agora" page and the detail on "Consumo". The weather comes from Open-Meteo
 * for the household's locality (src/weather/); without one, or when the
 * household said nothing electric follows the weather (src/domain/
 * installation.ts), the forecast leaves the temperature out.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { HowItWorks } from '../components/HowItWorks';
import { t } from '../i18n/pt-PT';
import { formatCents, formatWholeEuros } from '../lib/money';
import { formatLocalDate, lisbonToday } from '../lib/time';
import { formatCelsius, formatKwh } from '../lib/units';
import type { ChosenForecast } from '../ml/bill-forecast';
import { currentMonthForecast } from '../ml/month-forecast';
import type { HouseholdEnergy } from './household-energy';
import { useWeather, type Weather } from './use-weather';

const texts = t.forecast;

interface ForecastResult extends ChosenForecast {
  weather: Weather;
}

/** The forecast of the current month; undefined while loading, null without enough data. */
function useBillForecast(energy: HouseholdEnergy): ForecastResult | null | undefined {
  const [today] = useState(lisbonToday);
  const weather = useWeather(today);
  const { quarters, tariffs, tariffsFailed } = energy;
  return useMemo(() => {
    if (!quarters || !weather || (tariffs === null && !tariffsFailed)) return undefined;
    const chosen = currentMonthForecast(quarters, tariffs, weather.daily, today);
    return chosen ? { ...chosen, weather } : null;
  }, [quarters, tariffs, tariffsFailed, weather, today]);
}

const MONTH_NAME = new Intl.DateTimeFormat('pt-PT', { month: 'long', timeZone: 'UTC' });
const monthName = (month: string) => MONTH_NAME.format(new Date(`${month}-15T12:00:00Z`));

/** The main figure and its likely range, in euros (or kWh without a tariff). */
function Headline({ result }: { result: ForecastResult }) {
  const { forecast, range } = result;
  const money = forecast.costCents !== null;
  const format = (value: number) => (money ? formatWholeEuros(value) : formatKwh(value, 0));
  return (
    <>
      <p className="big">{format(forecast.costCents ?? forecast.totalWh)}</p>
      {range && <p>{texts.range(format(range.low), format(range.high))}</p>}
      <dl className="stats">
        <div>
          <dt>{texts.spent(forecast.knownDays)}</dt>
          <dd>
            {forecast.spentCents !== null
              ? formatCents(forecast.spentCents)
              : formatKwh(forecast.knownWh, 0)}
          </dd>
        </div>
        <div>
          <dt>{texts.energy}</dt>
          <dd>{formatKwh(forecast.totalWh, 0)}</dd>
        </div>
      </dl>
    </>
  );
}

/** Compact card for the "Agora" page. */
export function BillForecastCard({ energy }: { energy: HouseholdEnergy }) {
  const result = useBillForecast(energy);
  if (energy.error || energy.meters?.length === 0 || result === null) return null;
  return (
    <section className="card">
      <h2>{texts.title(monthName(lisbonToday().slice(0, 7)))}</h2>
      {result === undefined ? (
        <p className="hint">{t.loading}</p>
      ) : (
        <>
          <Headline result={result} />
          <p>
            <Link to="/consumo#previsao">{texts.details}</Link>
          </p>
        </>
      )}
    </section>
  );
}

const pct = (value: number) =>
  new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 1 }).format(value);

/** The forecast with how it was made, for the "Consumo" page. */
export function BillForecastDetail({ energy }: { energy: HouseholdEnergy }) {
  const result = useBillForecast(energy);
  if (result === undefined) {
    return (
      <section className="card" id="previsao">
        <h2>{texts.title(monthName(lisbonToday().slice(0, 7)))}</h2>
        <p className="hint">{t.loading}</p>
      </section>
    );
  }
  if (result === null) {
    return (
      <section className="card" id="previsao">
        <h2>{texts.titleShort}</h2>
        <p>{texts.notEnough}</p>
      </section>
    );
  }
  const { forecast, choice, errors, weather } = result;
  const today = forecast.asOf;
  // Days before today not measured yet (E-Redes sends them later).
  const late = forecast.days.filter((day) => !day.known && day.date < today);
  const upcoming = forecast.days.filter((day) => day.date >= today && day.tenths !== null);
  const meanUpcoming =
    upcoming.length > 0
      ? Math.round(upcoming.reduce((sum, day) => sum + day.tenths!, 0) / upcoming.length)
      : null;
  return (
    <section className="card form" id="previsao">
      <h2>{texts.title(monthName(forecast.month))}</h2>
      <p className="lead">{texts.intro}</p>
      <Headline result={result} />
      <HowItWorks>
        <ul className="hint caveats">
          <li>
            {forecast.method === 'naive' && choice !== 'naive'
              ? texts.methodFewData
              : choice === 'naive'
                ? texts.methodNaive
                : forecast.usesTemperature
                  ? texts.methodTemperature
                  : texts.methodType}
          </li>
          {choice !== 'temperature' && weather.daily && <li>{texts.temperatureLeftOut}</li>}
          {late.length > 0 && (
            <li>
              {texts.late(formatLocalDate(late[0]!.date), formatLocalDate(late.at(-1)!.date))}
            </li>
          )}
          {weather.notNeeded && <li>{texts.temperatureNotNeeded}</li>}
          {weather.location && meanUpcoming !== null && (
            <li>{texts.temperature(weather.location.name, formatCelsius(meanUpcoming))}</li>
          )}
          {!weather.location && !weather.notNeeded && (
            <li>
              {texts.noLocation} <Link to="/definicoes#casa">{texts.toSettings}</Link>
            </li>
          )}
          {weather.failed && <li>{texts.weatherFailed}</li>}
          {result.samples > 0 && (
            <li>
              {texts.backtest(
                result.samples,
                errors.temperature !== null && weather.daily ? pct(errors.temperature) : null,
                errors.dayType !== null ? pct(errors.dayType) : null,
                errors.naive !== null ? pct(errors.naive) : null,
              )}
            </li>
          )}
          {!result.range && <li>{texts.noRange}</li>}
          {forecast.costCents !== null && <li>{texts.costNote}</li>}
          {forecast.costCents === null && (
            <li>
              {texts.noTariff} <Link to="/definicoes#tarifario">{texts.toSettings}</Link>
            </li>
          )}
          {weather.daily && (
            <li>
              {texts.attribution}{' '}
              <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
                Open-Meteo
              </a>
            </li>
          )}
        </ul>
      </HowItWorks>
    </section>
  );
}
