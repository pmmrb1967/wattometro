// SPDX-License-Identifier: AGPL-3.0-or-later
/** An equipment's estimate (src/domain/equipment-estimate.ts) as the form types it. */
import type { EquipmentKind } from '../domain/equipment';
import { estimateSchema, type Estimate, type EstimateBasis } from '../domain/equipment-estimate';
import { formatHoursMinutes, parseHoursMinutes } from '../lib/time';
import { formatKwhField, parseKwhToWh } from '../lib/units';

export interface EstimateFields {
  basis: EstimateBasis | '';
  /** The label's energy, kWh in its own unit. */
  label: string;
  /** Cycles a week (cycles100), or h:mm a day (hours1000, plate). */
  use: string;
}

export const NO_ESTIMATE_FIELDS: EstimateFields = { basis: '', label: '', use: '' };

/** None without a basis; 'invalid' when a field the basis needs is missing or wrong. */
export function estimateOf(fields: EstimateFields): Estimate | null | 'invalid' {
  if (fields.basis === '') return null;
  const labelWh = parseKwhToWh(fields.label);
  const minutes = parseHoursMinutes(fields.use);
  const raw =
    fields.basis === 'year'
      ? { basis: 'year', labelWh }
      : fields.basis === 'cycles100'
        ? {
            basis: 'cycles100',
            labelWh,
            cyclesPerWeek: /^\s*\d{1,2}\s*$/.test(fields.use) ? Number(fields.use) : null,
          }
        : fields.basis === 'hours1000'
          ? { basis: 'hours1000', labelWh, minutesPerDay: minutes === null ? null : minutes / 60 }
          : { basis: 'plate', minutesPerDay: minutes === null ? null : minutes / 60 };
  const parsed = estimateSchema.safeParse(raw);
  return parsed.success ? parsed.data : 'invalid';
}

export function fieldsOf(estimate: Estimate | null): EstimateFields {
  if (estimate === null) return NO_ESTIMATE_FIELDS;
  const label = 'labelWh' in estimate ? formatKwhField(estimate.labelWh) : '';
  const use =
    estimate.basis === 'cycles100'
      ? String(estimate.cyclesPerWeek)
      : estimate.basis === 'year'
        ? ''
        : formatHoursMinutes(estimate.minutesPerDay * 60);
  return { basis: estimate.basis, label, use };
}

/** The label each kind carries; the plate for those without one. */
export function suggestedBasis(kind: EquipmentKind | ''): EstimateBasis {
  if (kind === 'fridge' || kind === 'freezer') return 'year';
  if (kind === 'washer' || kind === 'dishwasher' || kind === 'dryer') return 'cycles100';
  if (kind === 'tv') return 'hours1000';
  return 'plate';
}
