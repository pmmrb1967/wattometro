// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The house's equipment: what the user says they have, all optional but the
 * name, to help the app name what the Shelly sees
 * (docs/superpowers/specs/2026-11-03-equipment-inventory-design.md).
 *
 * The plate's power is a ceiling, not what the meter shows: measured, the
 * airfryer drew 95 % of its 2200 W and the washer heated at 93 % of its
 * 2100 W. A group well above the plate cannot be that equipment; below it, it
 * can (a hob uses one plate).
 */
import { z } from 'zod';

export const EQUIPMENT_KINDS = [
  'washer',
  'dishwasher',
  'dryer',
  'fridge',
  'freezer',
  'oven',
  'hob',
  'microwave',
  'airfryer',
  'kettle',
  'coffee',
  'heater',
  'air_conditioner',
  'water_heater',
  'ev_charger',
  'tv',
  'computer',
  'other',
] as const;
export type EquipmentKind = (typeof EQUIPMENT_KINDS)[number];

export const ENERGY_CLASSES = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const;

/** The kinds whose manual has a table of programmes the app matches whole programmes with. */
export const PROGRAMME_KINDS: readonly EquipmentKind[] = ['washer', 'dishwasher'];

/** More than a house has; keeps a runaway client from filling the table. */
export const MAX_EQUIPMENT = 100;
export const MAX_PROGRAMMES = 20;
/** How far above the plate a group may draw and still be that equipment (230 V, rounding). */
export const PLATE_MARGIN = 1.1;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => (value === '' ? null : value));

export const programmeSchema = z.object({
  name: z.string().trim().min(1).max(40),
  durationS: z.number().int().min(60).max(86_400),
  energyWh: z.number().int().min(0).max(20_000),
  temperatureC: z.number().int().min(0).max(95).nullable(),
  loadKg: z.number().min(0).max(20).multipleOf(0.5).nullable(),
});
export type Programme = z.infer<typeof programmeSchema>;

export const equipmentInputSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    kind: z.enum(EQUIPMENT_KINDS).nullable(),
    brand: optionalText(60),
    model: optionalText(60),
    room: optionalText(40),
    ratedPowerW: z.number().int().min(1).max(50_000).nullable(),
    energyClass: z.enum(ENERGY_CLASSES).nullable(),
    notes: optionalText(500),
    programmes: z.array(programmeSchema).max(MAX_PROGRAMMES),
  })
  .refine(
    ({ kind, programmes }) =>
      programmes.length === 0 || (kind !== null && PROGRAMME_KINDS.includes(kind)),
  );
export type EquipmentInput = z.infer<typeof equipmentInputSchema>;

export const equipmentSchema = equipmentInputSchema.and(
  z.object({ id: z.string(), createdAt: z.number().int() }),
);
export type Equipment = z.infer<typeof equipmentSchema>;

/** What two names are compared by: one house has one equipment of a name. */
export function nameKey(name: string): string {
  return name.trim().toLocaleLowerCase('pt');
}

/** Whether a group of this power at 230 V can be an equipment of this plate. */
export function fitsPlate(powerW230: number, ratedPowerW: number | null): boolean {
  return ratedPowerW === null || powerW230 * 10 <= ratedPowerW * 11;
}
