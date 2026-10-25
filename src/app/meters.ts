// SPDX-License-Identifier: AGPL-3.0-or-later
import { t } from '../i18n/pt-PT';
import type { Device, EnergyMeter } from './api';

/** Not a meter: E-Redes up to its last day, then the main Shelly (household-energy.ts). */
export const HOUSE_METER = 'house';

/**
 * "Casa (E-Redes) + Quadro (Shelly)", "E-Redes (contador da rede)" or the
 * Shelly's name (and channel) with "(Shelly)". `houseShelly` names the Shelly
 * of the house.
 */
export function meterLabel(meter: string, devices: Device[], houseShelly?: string | null): string {
  if (meter === HOUSE_METER) {
    return t.tariffs.houseMeter(houseShelly ? shellyName(houseShelly, devices) : 'Shelly');
  }
  if (meter === 'eredes') return t.tariffs.eredesMeter;
  return t.tariffs.shellyMeter(shellyName(meter, devices));
}

/** The Shelly's name, with its channel when not the first. */
export function shellyName(meter: string, devices: readonly Pick<Device, 'id' | 'name'>[]): string {
  const [deviceId, channel] = meter.split(':');
  const name = devices.find((device) => device.id === deviceId)?.name ?? deviceId ?? meter;
  return channel && channel !== '0' ? `${name} · ${t.now.channel(Number(channel))}` : name;
}

/** The meter with the most data; E-Redes on a tie (the billing reference). */
export function busiestMeter(meters: readonly EnergyMeter[]): string | null {
  const best = [...meters].sort(
    (a, b) => b.days - a.days || Number(b.meter === 'eredes') - Number(a.meter === 'eredes'),
  )[0];
  return best?.meter ?? null;
}
