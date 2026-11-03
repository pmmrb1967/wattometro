// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * What the AI read on a plate, an energy label or a manual's table
 * (src/ai/equipment-photo.ts), turned into the register's values. The AI only
 * copies the printed text; the numbers are read here, with the register's own
 * rules, and the user confirms each one before anything is saved
 * (docs/equipment.md).
 */
import { parsePrintedDurationS } from '../lib/time';
import { parsePrintedEnergyWh, parsePrintedPowerW } from '../lib/units';
import {
  ENERGY_CLASSES,
  EQUIPMENT_KINDS,
  MAX_PROGRAMMES,
  programmeSchema,
  type EquipmentInput,
  type Programme,
} from './equipment';

/** As printed: text, or null when the photos do not show it. */
export interface PrintedProgramme {
  name: string;
  duration: string | null;
  energy: string | null;
  temperature: string | null;
  load: string | null;
}

export interface PrintedEquipment {
  kind: string | null;
  brand: string | null;
  model: string | null;
  ratedPower: string | null;
  energyClass: string | null;
  programmes: PrintedProgramme[];
}

export interface EquipmentReading {
  kind: EquipmentInput['kind'];
  brand: string | null;
  model: string | null;
  ratedPowerW: number | null;
  energyClass: EquipmentInput['energyClass'];
  programmes: Programme[];
  /** Names of the programmes whose duration or energy could not be read. */
  refused: string[];
}

/** The register's limits (equipmentInputSchema). */
const MAX_TEXT = 60;
const MAX_POWER_W = 50_000;
const MAX_PROGRAMME_NAME = 40;

const text = (value: string | null): string | null => {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed.slice(0, MAX_TEXT);
};

/** A temperature in whole degrees up to 95 ("40 °C"); null otherwise ("Frio", "40.5"). */
const temperatureOf = (value: string | null): number | null => {
  const match = /(\d{1,3})([.,]\d)?/.exec(value ?? '');
  if (!match || match[2] !== undefined) return null;
  const degrees = Number(match[1]);
  return degrees <= 95 ? degrees : null;
};

/** A load in kg, in half kilos up to 20 ("4,5 kg"); null without "kg" ("13 conjuntos"). */
const loadOf = (value: string | null): number | null => {
  const match = /(\d{1,2})(?:[.,](\d{1,2}))?\s*kg/i.exec(value ?? '');
  if (!match) return null;
  const decimals = match[2] ?? '';
  const exact = decimals.slice(1).replace(/0/g, '') === '';
  const tenths = Number(match[1]) * 10 + Number(decimals.slice(0, 1) || '0');
  return exact && tenths % 5 === 0 && tenths <= 200 ? tenths / 10 : null;
};

function programmeOf(printed: PrintedProgramme): Programme | null {
  const durationS = printed.duration === null ? null : parsePrintedDurationS(printed.duration);
  const energyWh = printed.energy === null ? null : parsePrintedEnergyWh(printed.energy);
  if (durationS === null || energyWh === null) return null;
  const parsed = programmeSchema.safeParse({
    name: printed.name.trim().slice(0, MAX_PROGRAMME_NAME),
    durationS,
    energyWh,
    temperatureC: temperatureOf(printed.temperature),
    loadKg: loadOf(printed.load),
  });
  return parsed.success ? parsed.data : null;
}

export function fromPrinted(printed: PrintedEquipment): EquipmentReading {
  const kind = EQUIPMENT_KINDS.find((item) => item === printed.kind) ?? null;
  const label = (printed.energyClass ?? '').trim().toUpperCase();
  const energyClass = ENERGY_CLASSES.find((item) => item === label) ?? null;
  const power = printed.ratedPower === null ? null : parsePrintedPowerW(printed.ratedPower);
  const programmes: Programme[] = [];
  const refused: string[] = [];
  for (const item of printed.programmes) {
    const programme = programmeOf(item);
    if (programme === null || programmes.length >= MAX_PROGRAMMES) refused.push(item.name.trim());
    else programmes.push(programme);
  }
  return {
    kind,
    brand: text(printed.brand),
    model: text(printed.model),
    ratedPowerW: power !== null && power <= MAX_POWER_W ? power : null,
    energyClass,
    programmes,
    refused,
  };
}
