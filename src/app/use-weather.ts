// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The household's locality and daily mean temperatures (Open-Meteo, src/weather/),
 * for the bill forecast and the unusual days. Not asked for when the household
 * said nothing electric follows the weather (src/domain/installation.ts).
 */
import { useEffect, useState } from 'react';
import { addDays } from '../domain/consumption';
import { followsTemperature } from '../domain/installation';
import { startOfLisbonDay, type LocalDate } from '../lib/time';
import {
  CLIMATE_YEARS,
  FORECAST_DAYS,
  dailyMeans,
  loadHourlyTemperature,
} from '../weather/weather';
import { fetchHouseholdInstallation, fetchHouseholdLocation, type HouseholdLocation } from './api';
import { useSession } from './session';

/** The locality and the daily mean temperatures, observed and forecast. */
export interface Weather {
  location: HouseholdLocation | null;
  daily: Map<LocalDate, number> | null;
  failed: boolean;
  /** The installation says the temperature cannot matter: not even asked for. */
  notNeeded: boolean;
}

export function useWeather(today: LocalDate): Weather | undefined {
  const { signOut } = useSession();
  const [weather, setWeather] = useState<Weather | undefined>(undefined);
  useEffect(() => {
    let active = true;
    void (async () => {
      const [outcome, installation] = await Promise.all([
        fetchHouseholdLocation(),
        fetchHouseholdInstallation(),
      ]);
      if (!active) return;
      if (!outcome.ok || !installation.ok) {
        const unauthenticated = [outcome, installation].some(
          (o) => !o.ok && o.reason === 'unauthenticated',
        );
        if (unauthenticated) {
          signOut();
          return;
        }
      }
      const location = outcome.ok ? outcome.location : null;
      // An unknown installation keeps the temperature: the backtest decides.
      const notNeeded = installation.ok && !followsTemperature(installation.installation);
      if (!location || notNeeded) {
        setWeather({ location, daily: null, failed: false, notNeeded });
        return;
      }
      const from = startOfLisbonDay(
        `${Number(today.slice(0, 4)) - CLIMATE_YEARS}${today.slice(4)}`,
      );
      const to = startOfLisbonDay(addDays(today, FORECAST_DAYS + 1));
      const hours = await loadHourlyTemperature(location, from, to);
      if (!active) return;
      setWeather({
        location,
        daily: hours ? dailyMeans(hours) : null,
        failed: hours === null,
        notNeeded: false,
      });
    })();
    return () => {
      active = false;
    };
  }, [today, signOut]);
  return weather;
}
