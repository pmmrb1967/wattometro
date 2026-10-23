// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * What the Consumo, Tarifários and monthly report pages share: the household's
 * tariffs, its meters, the chosen meter and its quarter hours over one window
 * (from the first day of the month 13 months ago to the start of today, so a
 * month can be compared with the same month a year before). One window for all
 * pages, so the browser cache (energy-cache.ts) serves them all.
 */
import { useEffect, useState } from 'react';
import { addMonths } from '../domain/consumption';
import { tariffOn, type Tariff } from '../domain/tariff';
import { t } from '../i18n/pt-PT';
import { lisbonDate, lisbonToday, startOfLisbonDay, type EpochSeconds } from '../lib/time';
import {
  fetchDevices,
  fetchEnergyMeters,
  fetchTariffs,
  type Device,
  type EnergyMeter,
} from './api';
import { loadQuarters, type Quarter } from './energy-cache';
import { busiestMeter } from './meters';
import { useSession } from './session';

const YEAR = 365 * 86_400;
/** Months before the current one in the window. */
export const WINDOW_MONTHS = 13;

export interface EnergyWindow {
  from: EpochSeconds;
  /** Start of today (Lisbon): whole days only. */
  to: EpochSeconds;
  /** The last 365 days start here. */
  yearFrom: EpochSeconds;
}

export function energyWindow(today = lisbonToday()): EnergyWindow {
  const to = startOfLisbonDay(today);
  return {
    from: startOfLisbonDay(`${addMonths(today.slice(0, 7), -WINDOW_MONTHS)}-01`),
    to,
    yearFrom: startOfLisbonDay(lisbonDate(to - YEAR)),
  };
}

export interface HouseholdEnergy {
  window: EnergyWindow;
  error: string | null;
  /** All tariffs; null while loading or when they could not be read. */
  tariffs: Tariff[] | null;
  /** Today's tariff; undefined while loading, null without one (or unavailable). */
  tariff: Tariff | null | undefined;
  tariffsFailed: boolean;
  meters: EnergyMeter[] | null;
  devices: Device[];
  meter: string | null;
  setMeter: (meter: string) => void;
  /** Quarter hours of the chosen meter over the whole window, in time order. */
  quarters: Quarter[] | null;
}

export function useHouseholdEnergy(): HouseholdEnergy {
  const { me, signOut } = useSession();
  const [window] = useState(() => energyWindow());
  const [tariffs, setTariffs] = useState<Tariff[] | null>(null);
  const [tariffsFailed, setTariffsFailed] = useState(false);
  const [meters, setMeters] = useState<EnergyMeter[] | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [meter, setMeter] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<{ meter: string; quarters: Quarter[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([
      fetchTariffs(),
      fetchEnergyMeters(window.from, window.to),
      fetchDevices(),
    ]).then(([tariffList, energy, deviceList]) => {
      if (!active) return;
      if ([tariffList, energy, deviceList].some((o) => !o.ok && o.reason === 'unauthenticated')) {
        signOut();
        return;
      }
      if (!energy.ok) {
        setError(t.errors.unavailable);
        return;
      }
      if (tariffList.ok) setTariffs(tariffList.tariffs);
      else setTariffsFailed(true);
      setMeters(energy.meters);
      if (deviceList.ok) setDevices(deviceList.devices);
      setMeter(busiestMeter(energy.meters));
    });
    return () => {
      active = false;
    };
  }, [window, signOut]);

  useEffect(() => {
    if (!meter) return;
    let active = true;
    void loadQuarters(me.householdId, meter, window.from, window.to).then((outcome) => {
      if (!active) return;
      if (outcome.ok) setLoaded({ meter, quarters: outcome.quarters });
      else if (outcome.reason === 'unauthenticated') signOut();
      else setError(t.errors.unavailable);
    });
    return () => {
      active = false;
    };
  }, [me.householdId, meter, window, signOut]);

  const tariff =
    tariffs !== null ? tariffOn(tariffs, lisbonToday()) : tariffsFailed ? null : undefined;
  return {
    window,
    error,
    tariffs,
    tariff,
    tariffsFailed,
    meters,
    devices,
    meter,
    setMeter,
    quarters: loaded?.meter === meter ? loaded.quarters : null,
  };
}

/** The quarters of the last 365 days of the window. */
export function lastYear(quarters: readonly Quarter[], window: EnergyWindow): Quarter[] {
  return quarters.filter(({ ts }) => ts >= window.yearFrom);
}
