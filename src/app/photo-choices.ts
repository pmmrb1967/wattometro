// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * What a reading of photos (src/domain/equipment-reading.ts) offers the
 * equipment form, and the form once the user has chosen. Nothing the user
 * typed is replaced unless they tick it: a value read where the form is empty
 * comes ticked, one that would replace a different value does not.
 */
import { MAX_PROGRAMMES, nameKey, type EquipmentKind } from '../domain/equipment';
import type { EquipmentReading } from '../domain/equipment-reading';
import { rowOf, type ProgrammeRow } from './programme-row';

/** The form's fields as it holds them (text until saved). */
export interface FormValues {
  kind: EquipmentKind | '';
  brand: string;
  model: string;
  power: string;
  energyClass: string;
  rows: ProgrammeRow[];
}

export type FieldKey = 'kind' | 'brand' | 'model' | 'power' | 'energyClass';

export interface FieldChoice {
  key: FieldKey;
  /** As the form would hold it. */
  read: string;
  current: string;
  checked: boolean;
}

export interface ProgrammeChoice {
  row: ProgrammeRow;
  /** A programme of the same name is in the form: ticking it replaces that one. */
  replaces: boolean;
  checked: boolean;
}

export interface PhotoChoices {
  fields: FieldChoice[];
  programmes: ProgrammeChoice[];
}

/**
 * What the user ticked or unticked, with what the form held then: a choice
 * counts only while the form still holds that, so a value typed meanwhile is
 * never replaced on a choice made before it.
 */
export interface Decisions {
  fields: Partial<Record<FieldKey, { checked: boolean; current: string }>>;
  /** By the programme's name key. */
  programmes: Record<string, { checked: boolean; replaces: boolean }>;
}

export const NO_DECISIONS: Decisions = { fields: {}, programmes: {} };

export function decisionsOf(choices: PhotoChoices): Decisions {
  return {
    fields: Object.fromEntries(
      choices.fields.map((field) => [
        field.key,
        { checked: field.checked, current: field.current },
      ]),
    ),
    programmes: Object.fromEntries(
      choices.programmes.map((item) => [
        nameKey(item.row.name),
        { checked: item.checked, replaces: item.replaces },
      ]),
    ),
  };
}

export function photoChoices(
  reading: EquipmentReading,
  current: FormValues,
  decisions: Decisions = NO_DECISIONS,
): PhotoChoices {
  const read: Record<FieldKey, string | null> = {
    kind: reading.kind,
    brand: reading.brand,
    model: reading.model,
    power: reading.ratedPowerW === null ? null : String(reading.ratedPowerW),
    energyClass: reading.energyClass,
  };
  const fields = (Object.keys(read) as FieldKey[]).flatMap((key): FieldChoice[] => {
    const value = read[key];
    const now = current[key].trim();
    if (value === null || value === now) return [];
    const decided = decisions.fields[key];
    const checked = decided && decided.current === now ? decided.checked : now === '';
    return [{ key, read: value, current: now, checked }];
  });
  const names = new Set(current.rows.map((row) => nameKey(row.name)));
  const programmes = reading.programmes.map((programme) => {
    const replaces = names.has(nameKey(programme.name));
    const decided = decisions.programmes[nameKey(programme.name)];
    const checked = decided && decided.replaces === replaces ? decided.checked : !replaces;
    return { row: rowOf(programme), replaces, checked };
  });
  return { fields, programmes };
}

/** The form with the ticked values; programmes past the register's limit are left out. */
export function applyChoices(current: FormValues, choices: PhotoChoices): FormValues {
  const next: FormValues = { ...current, rows: [...current.rows] };
  for (const field of choices.fields) {
    if (!field.checked) continue;
    if (field.key === 'kind') next.kind = field.read as EquipmentKind;
    else next[field.key] = field.read;
  }
  for (const { row, checked } of choices.programmes) {
    if (!checked) continue;
    const index = next.rows.findIndex((item) => nameKey(item.name) === nameKey(row.name));
    if (index >= 0) next.rows[index] = row;
    else if (next.rows.length < MAX_PROGRAMMES) next.rows.push(row);
  }
  return next;
}
