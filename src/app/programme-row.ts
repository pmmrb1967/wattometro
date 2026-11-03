// SPDX-License-Identifier: AGPL-3.0-or-later
/** A manual's programme as the form types it, text until it is saved (Equipment.tsx). */
import { programmeSchema, type Programme } from '../domain/equipment';
import { formatHoursMinutes, parseHoursMinutes } from '../lib/time';
import { formatKwhField, parseKwhToWh } from '../lib/units';

export interface ProgrammeRow {
  name: string;
  duration: string;
  energy: string;
  temperature: string;
  load: string;
}

export const EMPTY_ROW: ProgrammeRow = {
  name: '',
  duration: '',
  energy: '',
  temperature: '',
  load: '',
};

export const rowOf = (programme: Programme): ProgrammeRow => ({
  name: programme.name,
  duration: formatHoursMinutes(programme.durationS),
  energy: formatKwhField(programme.energyWh),
  temperature: programme.temperatureC === null ? '' : String(programme.temperatureC),
  load: programme.loadKg === null ? '' : String(programme.loadKg).replace('.', ','),
});

const optionalNumber = (text: string): number | null => {
  const trimmed = text.trim().replace(',', '.');
  return trimmed === '' ? null : Number(trimmed);
};

/** The row as a programme; null when any field is not what the schema takes. */
export function programmeOf(row: ProgrammeRow): Programme | null {
  const durationS = parseHoursMinutes(row.duration);
  const energyWh = parseKwhToWh(row.energy);
  if (durationS === null || energyWh === null) return null;
  const parsed = programmeSchema.safeParse({
    name: row.name,
    durationS,
    energyWh,
    temperatureC: optionalNumber(row.temperature),
    loadKg: optionalNumber(row.load),
  });
  return parsed.success ? parsed.data : null;
}
