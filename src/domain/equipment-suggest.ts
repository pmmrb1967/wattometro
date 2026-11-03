// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The register where appliances are named: the equipment a group can be (its
 * power within the plate's ceiling) offered first, the others after with a
 * warning, none refused; and the equipment still without a recognised
 * appliance ("Por calibrar").
 */
import { fitsPlate, type Equipment } from './equipment';

export function suggestEquipment(
  powerW230: number,
  items: readonly Equipment[],
): { item: Equipment; fits: boolean }[] {
  return items
    .map((item) => ({ item, fits: fitsPlate(powerW230, item.ratedPowerW) }))
    .sort(
      (a, b) => Number(b.fits) - Number(a.fits) || a.item.name.localeCompare(b.item.name, 'pt'),
    );
}

export function uncalibrated(
  items: readonly Equipment[],
  appliances: readonly { equipmentId: string | null }[],
): Equipment[] {
  const linked = new Set(appliances.map((appliance) => appliance.equipmentId));
  return items.filter((item) => !linked.has(item.id));
}
