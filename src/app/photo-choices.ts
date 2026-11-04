// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * What a reading of photos (src/domain/equipment-reading.ts) offers the
 * equipment form, and the form once the user has chosen. Nothing the user
 * typed is replaced unless they tick it: a value read where the form is empty
 * comes ticked, one that would replace a different value does not.
 */
import { MAX_PROGRAMMES, nameKey, type EquipmentKind } from '../domain/equipment';
import type { EquipmentReading } from '../domain/equipment-reading';
import type { EstimateBasis } from '../domain/equipment-estimate';
import { formatKwhField, parseKwhToWh } from '../lib/units';
import { estimateOf, type EstimateFields } from './estimate-fields';
import { rowOf, type ProgrammeRow } from './programme-row';

/** The form's fields as it holds them (text until saved). */
export interface FormValues {
  kind: EquipmentKind | '';
  brand: string;
  model: string;
  power: string;
  energyClass: string;
  rows: ProgrammeRow[];
  estimate: EstimateFields;
}

export type FieldKey = 'kind' | 'brand' | 'model' | 'power' | 'energyClass' | 'label';

/** The label's energy as one field: "basis:kWh" ("cycles100:58,000"); empty without a basis. */
export const labelField = (basis: string, label: string) =>
  basis === '' ? '' : `${basis}:${label}`;

export function splitLabelField(value: string): { basis: EstimateBasis; label: string } {
  const [basis = '', label = ''] = value.split(':');
  return { basis: basis as EstimateBasis, label };
}

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

/**
 * The form's label as photoChoices compares it: empty when the read basis is
 * chosen without a label, and equal to the reading when it is the same
 * energy written otherwise ("58" and "58,000").
 */
function heldLabel(reading: EquipmentReading, current: FormValues): string {
  const { basis, label } = current.estimate;
  const held = labelField(basis, label.trim());
  // Another basis chosen (the plate, say) is the user's: the label would replace it.
  if (!reading.label || basis !== reading.label.basis) return held;
  if (label.trim() === '') return '';
  return parseKwhToWh(label) === reading.label.labelWh
    ? labelField(reading.label.basis, formatKwhField(reading.label.labelWh))
    : held;
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
    label: reading.label && labelField(reading.label.basis, formatKwhField(reading.label.labelWh)),
  };
  const now: Record<FieldKey, string> = {
    kind: current.kind,
    brand: current.brand,
    model: current.model,
    power: current.power,
    energyClass: current.energyClass,
    label: heldLabel(reading, current),
  };
  const fields = (Object.keys(read) as FieldKey[]).flatMap((key): FieldChoice[] => {
    const value = read[key];
    const held = now[key].trim();
    if (value === null || value === held) return [];
    const decided = decisions.fields[key];
    // An optional estimate must never block "Guardar": per 100 cycles needs the cycles a week.
    const usable =
      key !== 'label' ||
      estimateOf({ ...current.estimate, ...splitLabelField(value) }) !== 'invalid';
    const checked = decided && decided.current === held ? decided.checked : held === '' && usable;
    return [{ key, read: value, current: held, checked }];
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
  const next: FormValues = {
    ...current,
    rows: [...current.rows],
    estimate: { ...current.estimate },
  };
  for (const field of choices.fields) {
    if (!field.checked) continue;
    if (field.key === 'kind') next.kind = field.read as EquipmentKind;
    else if (field.key === 'label')
      next.estimate = { ...next.estimate, ...splitLabelField(field.read) };
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
