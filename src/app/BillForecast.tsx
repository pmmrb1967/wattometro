// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The month's bill before it arrives (src/ml/bill-forecast.ts): a card on the
 * "Agora" page and the detail on "Consumo". The weather comes from Open-Meteo
 * for the household's locality (src/weather/); without one, the forecast
 * leaves the temperature out.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { addDays, monthDates } from '../domain/consumption';
import { tariffOn } from '../domain/tariff';
import { t } from '../i18n/pt-PT';
import { formatCents, formatWholeEuros } from '../lib/money';
import { formatLocalDate, lisbonToday, startOfLisbonDay, type LocalDate } from '../lib/time';
import { formatCelsius, formatKwh } from '../lib/units';
import { chooseForecast, prepareForecast, type ChosenForecast } from '../ml/bill-forecast';
import {
  CLIMATE_YEARS,
  FORECAST_DAYS,
  climateNormal,
  dailyMeans,
  loadHourlyTemperature,
} from '../weather/weather';
import { fetchHouseholdLocation, type HouseholdLocation } from './api';
import type { HouseholdEnergy } from './household-energy';
import { useSession } from './session';

const texts = t.forecast;

/** The locality and the daily mean temperatures, observed and forecast. */
interface Weather {
  location: HouseholdLocation | null;
  daily: Map<LocalDate, number> | null;
  failed: boolean;
}

function useWeather(today: LocalDate): Weather | undefined {
  const { signOut } = useSession();
  const [weather, setWeather] = useState<Weather | undefined>(undefined);
  useEffect(() => {
    let active = true;
    void (async () => {
      const outcome = await fetchHouseholdLocation();
      if (!active) return;
      if (!outcome.ok) {
        if (outcome.reason === 'unauthenticated') signOut();
        else setWeather({ location: null, daily: null, failed: false });
        return;
      }
      const location = outcome.location;
      if (!location) {
        setWeather({ location: null, daily: null, failed: false });
        return;
      }
      const from = startOfLisbonDay(
        `${Number(today.slice(0, 4)) - CLIMATE_YEARS}${today.slice(4)}`,
      );
      const to = startOfLisbonDay(addDays(today, FORECAST_DAYS + 1));
      const hours = await loadHourlyTemperature(location, from, to);
      if (!active) return;
      setWeather({ location, daily: hours ? dailyMeans(hours) : null, failed: hours === null });
    })();
    return () => {
      active = false;
    };
  }, [today, signOut]);
  return weather;
}

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
    const month = today.slice(0, 7);
    // The tariff in force at the end of the month, as on the bill.
    const tariff = tariffs ? tariffOn(tariffs, monthDates(month).at(-1)!) : null;
    const data = prepareForecast(quarters, tariff);
    const daily = weather.daily;
    const measured = new Map([...(daily ?? [])].filter(([date]) => date < today));
    const normal = climateNormal(measured);
    const temperatureOf = (date: LocalDate) => (daily ? (daily.get(date) ?? normal(date)) : null);
    const chosen = chooseForecast(
      data,
      month,
      today,
      temperatureOf,
      (date) => measured.get(date) ?? null,
      daily ? normal : () => null,
    );
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
          <li>{texts.late(formatLocalDate(late[0]!.date), formatLocalDate(late.at(-1)!.date))}</li>
        )}
        {weather.location && meanUpcoming !== null && (
          <li>{texts.temperature(weather.location.name, formatCelsius(meanUpcoming))}</li>
        )}
        {!weather.location && (
          <li>
            {texts.noLocation} <Link to="/definicoes">{texts.toSettings}</Link>
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
            {texts.noTariff} <Link to="/definicoes">{texts.toSettings}</Link>
          </li>
        )}
        {weather.location && (
          <li>
            {texts.attribution}{' '}
            <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
              Open-Meteo
            </a>
          </li>
        )}
      </ul>
    </section>
  );
}
