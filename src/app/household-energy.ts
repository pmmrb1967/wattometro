// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * What the Consumo, Tarifários and monthly report pages share: the household's
 * tariffs, its meters, the chosen meter and its quarter hours over one window
 * (from the first day of the month 13 months ago to the start of today, so a
 * month can be compared with the same month a year before). One window for all
 * pages, so the browser cache (energy-cache.ts) serves them all.
 *
 * With E-Redes and a Shelly, the default is the house (HOUSE_METER): E-Redes up
 * to its last imported day, the Shelly after it (houseQuarters). Today, still
 * going, comes apart (`today`, from /v1/now) for the charts only: totals,
 * forecasts and comparisons use whole days.
 */
import { useEffect, useState } from 'react';
import { addMonths, houseQuarters } from '../domain/consumption';
import { tariffOn, type Tariff } from '../domain/tariff';
import { t } from '../i18n/pt-PT';
import {
  lisbonDate,
  lisbonToday,
  startOfLisbonDay,
  type EpochSeconds,
  type LocalDate,
} from '../lib/time';
import {
  fetchDevices,
  fetchEnergyMeters,
  fetchNow,
  fetchTariffs,
  type Device,
  type EnergyMeter,
  type Now,
} from './api';
import { loadQuarters, type Quarter } from './energy-cache';
import { busiestMeter, HOUSE_METER } from './meters';
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
  /** What can be chosen: the house (with E-Redes and a Shelly), then each meter. */
  choices: string[];
  devices: Device[];
  meter: string | null;
  setMeter: (meter: string) => void;
  /** Quarter hours of the chosen meter over the whole window, in time order. */
  quarters: Quarter[] | null;
  /** First day taken from the Shelly in the house (today included); null otherwise. */
  shellyFrom: LocalDate | null;
  /** Today's quarters so far, from a Shelly; null for E-Redes or when unknown. */
  today: Quarter[] | null;
}

const meterOf = (item: Now['meters'][number]) => `${item.deviceId}:${item.channel}`;

/**
 * The Shelly that measures the house: the one with most days; before its first
 * whole day, the one with most minutes today.
 */
function mainShelly(meters: readonly EnergyMeter[], now: Now | null): string | null {
  const measured = busiestMeter(meters.filter((item) => item.meter !== 'eredes'));
  if (measured) return measured;
  const today = [...(now?.meters ?? [])]
    .filter((item) => item.today.minutes > 0)
    .sort((a, b) => b.today.minutes - a.today.minutes)[0];
  return today ? meterOf(today) : null;
}

export function useHouseholdEnergy(): HouseholdEnergy {
  const { me, signOut } = useSession();
  const [window] = useState(() => energyWindow());
  const [tariffs, setTariffs] = useState<Tariff[] | null>(null);
  const [tariffsFailed, setTariffsFailed] = useState(false);
  const [meters, setMeters] = useState<EnergyMeter[] | null>(null);
  const [now, setNow] = useState<Now | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [meter, setMeter] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<{
    meter: string;
    quarters: Quarter[];
    shellyFrom: LocalDate | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([
      fetchTariffs(),
      fetchEnergyMeters(window.from, window.to),
      fetchDevices(),
      fetchNow(),
    ]).then(([tariffList, energy, deviceList, nowOutcome]) => {
      if (!active) return;
      if (
        [tariffList, energy, deviceList, nowOutcome].some(
          (o) => !o.ok && o.reason === 'unauthenticated',
        )
      ) {
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
      // Without /v1/now there is no today, nor a Shelly before its first whole day.
      const current = nowOutcome.ok ? nowOutcome.now : null;
      setNow(current);
      const hasEredes = energy.meters.some((item) => item.meter === 'eredes');
      const shelly = mainShelly(energy.meters, current);
      setMeter(hasEredes && shelly ? HOUSE_METER : (busiestMeter(energy.meters) ?? shelly));
    });
    return () => {
      active = false;
    };
  }, [window, signOut]);

  const shelly = meters ? mainShelly(meters, now) : null;
  /** Meters with whole days in the window; a Shelly started today has only `today`. */
  const withDays = meters?.map((item) => item.meter).join(',') ?? '';

  useEffect(() => {
    if (!meter) return;
    let active = true;
    const load = (id: string | null) =>
      id && withDays.split(',').includes(id)
        ? loadQuarters(me.householdId, id, window.from, window.to)
        : Promise.resolve({ ok: true as const, quarters: [] as Quarter[] });
    const parts = meter === HOUSE_METER ? [load('eredes'), load(shelly)] : [load(meter)];
    void Promise.all(parts).then((outcomes) => {
      if (!active) return;
      const quarters: Quarter[][] = [];
      for (const outcome of outcomes) {
        if (!outcome.ok) {
          if (outcome.reason === 'unauthenticated') signOut();
          else setError(t.errors.unavailable);
          return;
        }
        quarters.push(outcome.quarters);
      }
      const [first = [], second = []] = quarters;
      setLoaded(
        meter === HOUSE_METER
          ? { meter, ...houseQuarters(first, second) }
          : { meter, quarters: first, shellyFrom: null },
      );
    });
    return () => {
      active = false;
    };
  }, [me.householdId, meter, shelly, withDays, window, signOut]);

  const listed = meters?.map((item) => item.meter) ?? [];
  const choices = [
    ...(shelly && listed.includes('eredes') ? [HOUSE_METER] : []),
    ...listed,
    ...(shelly && !listed.includes(shelly) ? [shelly] : []),
  ];
  const todayMeter = meter === HOUSE_METER ? shelly : meter === 'eredes' ? null : meter;
  const todayOf = now?.meters.find((item) => meterOf(item) === todayMeter);
  // In the house, today comes from the Shelly even when no whole day does yet.
  const firstToday = todayOf?.today.quarters[0];
  const todayFromShelly = meter === HOUSE_METER && firstToday ? lisbonDate(firstToday.ts) : null;
  const tariff =
    tariffs !== null ? tariffOn(tariffs, lisbonToday()) : tariffsFailed ? null : undefined;
  return {
    window,
    error,
    tariffs,
    tariff,
    tariffsFailed,
    meters,
    choices,
    devices,
    meter,
    setMeter,
    quarters: loaded?.meter === meter ? loaded.quarters : null,
    shellyFrom: loaded?.meter === meter ? (loaded.shellyFrom ?? todayFromShelly) : null,
    today: todayOf ? todayOf.today.quarters : null,
  };
}

/** The quarters of the last 365 days of the window. */
export function lastYear(quarters: readonly Quarter[], window: EnergyWindow): Quarter[] {
  return quarters.filter(({ ts }) => ts >= window.yearFrom);
}
