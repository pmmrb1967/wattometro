// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The equipment form's "Para a estimativa": the energy label's value in its
 * own unit, or the plate, and the use the user states
 * (src/domain/equipment-estimate.ts, estimate-fields.ts). Optional.
 */
import type { EquipmentKind } from '../domain/equipment';
import { ESTIMATE_BASES, type EstimateBasis } from '../domain/equipment-estimate';
import { t } from '../i18n/pt-PT';
import { estimateOf, suggestedBasis, type EstimateFields } from './estimate-fields';

const texts = t.equipmentEstimate.fields;

export function EstimateFieldset({
  fields,
  kind,
  hasPlate,
  disabled,
  onChange,
}: {
  fields: EstimateFields;
  kind: EquipmentKind | '';
  hasPlate: boolean;
  disabled: boolean;
  onChange: (fields: EstimateFields) => void;
}) {
  const suggested = suggestedBasis(kind);
  const bases = [suggested, ...ESTIMATE_BASES.filter((basis) => basis !== suggested)];
  const invalid = estimateOf(fields) === 'invalid';
  const set = (change: Partial<EstimateFields>) => onChange({ ...fields, ...change });
  return (
    <fieldset className="estimate-fields">
      <legend>{texts.title}</legend>
      <p className="hint">{texts.intro}</p>
      <label>
        {texts.basis}
        <select
          value={fields.basis}
          disabled={disabled}
          onChange={(event) => set({ basis: event.target.value as EstimateBasis | '' })}
        >
          <option value="">{texts.none}</option>
          {bases.map((basis) => (
            <option key={basis} value={basis}>
              {basis === suggested && kind !== ''
                ? texts.suggested(texts.bases[basis])
                : texts.bases[basis]}
            </option>
          ))}
        </select>
      </label>
      {fields.basis !== '' && fields.basis !== 'plate' && (
        <label>
          {texts.label[fields.basis]}
          <input
            inputMode="decimal"
            value={fields.label}
            disabled={disabled}
            onChange={(event) => set({ label: event.target.value })}
          />
        </label>
      )}
      {fields.basis === 'cycles100' && (
        <label>
          {texts.cyclesPerWeek}
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={50}
            value={fields.use}
            disabled={disabled}
            onChange={(event) => set({ use: event.target.value })}
          />
        </label>
      )}
      {(fields.basis === 'hours1000' || fields.basis === 'plate') && (
        <label>
          {texts.timePerDay}
          <input
            value={fields.use}
            placeholder="0:30"
            disabled={disabled}
            onChange={(event) => set({ use: event.target.value })}
          />
        </label>
      )}
      {fields.basis === 'plate' && !hasPlate && <p className="hint">{texts.needsPlate}</p>}
      {fields.basis === 'plate' && hasPlate && <p className="hint">{texts.plateCeiling}</p>}
      <p className="hint" role="status">
        {invalid ? texts.invalid : ''}
      </p>
    </fieldset>
  );
}
