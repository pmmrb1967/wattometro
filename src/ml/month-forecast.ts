// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The current month's bill forecast as the app shows it ("Agora", "Consumo"
 * and the AI's forecast_month_bill): the tariff in force at the end of the
 * month, the measured temperatures before today and the climate normal after.
 * One function, so every place gives the same number.
 */
import { monthDates } from '../domain/consumption';
import { tariffOn, type Tariff } from '../domain/tariff';
import type { EpochSeconds, LocalDate } from '../lib/time';
import type { TenthsCelsius, Wh } from '../lib/units';
import { climateNormal } from '../weather/weather';
import { chooseForecast, prepareForecast, type ChosenForecast } from './bill-forecast';

/**
 * `daily`: mean temperature per day (observed and forecast), or null when the
 * temperature is not used.
 */
export function currentMonthForecast(
  quarters: readonly { ts: EpochSeconds; energyWh: Wh }[],
  tariffs: readonly Tariff[] | null,
  daily: ReadonlyMap<LocalDate, TenthsCelsius> | null,
  today: LocalDate,
): ChosenForecast | null {
  const month = today.slice(0, 7);
  // The tariff in force at the end of the month, as on the bill.
  const tariff = tariffs ? tariffOn(tariffs, monthDates(month).at(-1)!) : null;
  const data = prepareForecast(quarters, tariff);
  const measured = new Map([...(daily ?? [])].filter(([date]) => date < today));
  const normal = climateNormal(measured);
  const temperatureOf = (date: LocalDate) => (daily ? (daily.get(date) ?? normal(date)) : null);
  return chooseForecast(
    data,
    month,
    today,
    temperatureOf,
    (date) => measured.get(date) ?? null,
    daily ? normal : () => null,
  );
}
