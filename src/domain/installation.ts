// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * What the household told us about its installation (Settings → "A tua
 * instalação"): how it heats the rooms and the water, cooks, and whether it
 * has air conditioning, solar panels or an electric car. Every answer may be
 * unknown (null). A hint for the calculations, never a replacement for the
 * data: the forecast still picks its method by backtest (src/ml/). Shared by
 * the app and the server (validation of PUT /v1/household/installation).
 */
import { z } from 'zod';

/** Room heating; several at once (e.g. a gas boiler and a heater in one room). */
export const HEATING_KINDS = [
  'gas-boiler',
  'heat-pump',
  'electric-heaters',
  'wood',
  'none',
] as const;
export type HeatingKind = (typeof HEATING_KINDS)[number];

export const WATER_HEATING_KINDS = ['gas', 'electric', 'heat-pump', 'solar'] as const;
export type WaterHeatingKind = (typeof WATER_HEATING_KINDS)[number];

export const HOB_KINDS = ['electric', 'gas'] as const;
export type HobKind = (typeof HOB_KINDS)[number];

/** Heating that runs on electricity, so the weather moves the bill. */
const ELECTRIC_HEATING: readonly HeatingKind[] = ['heat-pump', 'electric-heaters'];

export const installationSchema = z.object({
  /** Null: not known. 'none' cannot go with another kind. Kept in HEATING_KINDS order. */
  heating: z
    .array(z.enum(HEATING_KINDS))
    .min(1)
    .refine((list) => new Set(list).size === list.length, 'duplicate')
    .refine((list) => !list.includes('none') || list.length === 1, 'none with others')
    .transform((list) => HEATING_KINDS.filter((kind) => list.includes(kind)))
    .nullable(),
  airConditioning: z.boolean().nullable(),
  waterHeating: z.enum(WATER_HEATING_KINDS).nullable(),
  hob: z.enum(HOB_KINDS).nullable(),
  solarPanels: z.boolean().nullable(),
  electricCar: z.boolean().nullable(),
});
export type Installation = z.output<typeof installationSchema>;

export const UNKNOWN_INSTALLATION: Installation = {
  heating: null,
  airConditioning: null,
  waterHeating: null,
  hob: null,
  solarPanels: null,
  electricCar: null,
};

/**
 * Whether the outdoor temperature can move this house's electricity: false only
 * when the household said its heating is not electric and it has no air
 * conditioning. Unknown answers keep the temperature in (the backtest decides).
 */
export function followsTemperature(installation: Installation): boolean {
  if (installation.heating === null || installation.airConditioning !== false) return true;
  return installation.heating.some((kind) => ELECTRIC_HEATING.includes(kind));
}
