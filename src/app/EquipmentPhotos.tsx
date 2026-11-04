// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * "Ler de fotografias" in the equipment form: up to three photos of a plate,
 * an energy label or a manual's table, made small in the browser, sent with
 * the user's own key after showing the cost (always: this sends photos), and
 * kept nowhere. What was read is offered value by value (photo-choices.ts);
 * the form is saved as usual. Nothing is shown without a key.
 */
import { useState, type ChangeEvent } from 'react';
import { estimateEquipmentPhotos, readEquipmentPhotos } from '../ai/equipment-photo';
import { formatMicroUsd } from '../ai/models';
import { MAX_EQUIPMENT_PHOTOS } from '../ai/prompts/equipment-photo';
import { AiError, type AiImage } from '../ai/provider';
import { providerFromSettings, recordUsage } from '../ai/settings';
import { PROGRAMME_KINDS, type EquipmentKind } from '../domain/equipment';
import type { EquipmentReading } from '../domain/equipment-reading';
import { t } from '../i18n/pt-PT';
import { shrinkPhoto } from '../lib/image';
import { useAiSettings } from './ai-sync';
import { aiErrorText } from './ai-errors';
import {
  applyChoices,
  decisionsOf,
  NO_DECISIONS,
  photoChoices,
  splitLabelField,
  type Decisions,
  type FieldChoice,
  type FormValues,
  type PhotoChoices,
} from './photo-choices';
import { useSession } from './session';

const texts = t.equipmentPhotos;
const fieldTexts = t.equipment.fields;

type State =
  | { kind: 'idle'; note: string | null }
  | { kind: 'preparing' }
  | { kind: 'confirm'; photos: AiImage[]; cost: string }
  | { kind: 'busy' }
  | { kind: 'review'; reading: EquipmentReading; decisions: Decisions; spent: string }
  | { kind: 'error'; text: string };

const totalCost = (usage: readonly { costMicroUsd: number }[]) =>
  formatMicroUsd(usage.reduce((sum, item) => sum + item.costMicroUsd, 0));

function fieldLabel(key: FieldChoice['key']): string {
  if (key === 'kind') return fieldTexts.kind;
  if (key === 'brand') return fieldTexts.brand;
  if (key === 'model') return fieldTexts.model;
  if (key === 'power') return fieldTexts.ratedPower;
  if (key === 'label') return t.equipmentEstimate.fields.labelRead;
  return fieldTexts.energyClass;
}

function fieldValue(choice: FieldChoice, value: string): string {
  if (value === '') return value;
  if (choice.key === 'kind') return t.equipment.kinds[value as EquipmentKind];
  if (choice.key === 'label') {
    const { basis, label } = splitLabelField(value);
    return basis === 'plate' || label === ''
      ? t.equipmentEstimate.fields.bases[basis]
      : t.equipmentEstimate.fields.labelValue[basis](label);
  }
  return value;
}

export function EquipmentPhotos({
  values,
  disabled,
  onApply,
}: {
  values: FormValues;
  disabled: boolean;
  onApply: (values: FormValues) => void;
}) {
  const { me } = useSession();
  const settings = useAiSettings(me.email);
  const provider = providerFromSettings(settings);
  const [state, setState] = useState<State>({ kind: 'idle', note: null });
  if (!provider) return null;

  async function onFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!provider || files.length === 0) return;
    if (files.length > MAX_EQUIPMENT_PHOTOS) {
      setState({ kind: 'error', text: texts.tooMany(MAX_EQUIPMENT_PHOTOS) });
      return;
    }
    setState({ kind: 'preparing' });
    const photos = await Promise.all(files.map(shrinkPhoto));
    if (photos.some((photo) => photo === null)) {
      setState({ kind: 'error', text: texts.unreadable });
      return;
    }
    const ready = photos as AiImage[];
    const estimate = estimateEquipmentPhotos(provider.model, ready.length);
    setState({ kind: 'confirm', photos: ready, cost: formatMicroUsd(estimate.costMicroUsd) });
  }

  async function send(photos: AiImage[]) {
    if (!provider) return;
    setState({ kind: 'busy' });
    try {
      const { reading, usage } = await readEquipmentPhotos(provider, photos);
      recordUsage(me.email, usage);
      setState({ kind: 'review', reading, decisions: NO_DECISIONS, spent: totalCost(usage) });
    } catch (error) {
      if (error instanceof AiError) recordUsage(me.email, error.usage);
      setState({ kind: 'error', text: aiErrorText(error) });
    }
  }

  const picker = (
    <label>
      {texts.choose}
      <input
        type="file"
        accept="image/*"
        multiple
        disabled={disabled}
        onChange={(event) => void onFiles(event)}
      />
    </label>
  );

  if (state.kind === 'review') {
    const { reading, decisions, spent } = state;
    const refused = reading.refused;
    // Worked out again from the form as it is now: what was typed meanwhile counts.
    const choices = photoChoices(reading, values, decisions);
    const tick = (change: (choices: PhotoChoices) => PhotoChoices) =>
      setState({ ...state, decisions: decisionsOf(change(choices)) });
    const chosenKind = choices.fields.find((field) => field.key === 'kind' && field.checked);
    const finalKind = (chosenKind?.read ?? values.kind) as EquipmentKind | '';
    const withProgrammes = finalKind !== '' && PROGRAMME_KINDS.includes(finalKind);
    const nothing = choices.fields.length === 0 && choices.programmes.length === 0;
    return (
      <section className="equipment-photos review" aria-live="polite">
        <h3>{texts.reviewTitle}</h3>
        {nothing ? <p>{texts.nothing}</p> : <p className="hint">{texts.reviewIntro}</p>}
        {choices.fields.map((field) => (
          <label className="checkbox" key={field.key}>
            <input
              type="checkbox"
              checked={field.checked}
              onChange={(event) =>
                tick((current) => ({
                  ...current,
                  fields: current.fields.map((item) =>
                    item.key === field.key ? { ...item, checked: event.target.checked } : item,
                  ),
                }))
              }
            />
            <span>
              {fieldLabel(field.key)}: <strong>{fieldValue(field, field.read)}</strong>
              {field.current !== '' && (
                <span className="hint"> ({texts.now(fieldValue(field, field.current))})</span>
              )}
            </span>
          </label>
        ))}
        {choices.programmes.length > 0 &&
          (withProgrammes ? (
            <fieldset>
              <legend>{t.equipment.programmes.title}</legend>
              {choices.programmes.map((item, index) => (
                <label className="checkbox" key={`${item.row.name}-${index}`}>
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={(event) =>
                      tick((current) => ({
                        ...current,
                        programmes: current.programmes.map((each, at) =>
                          at === index ? { ...each, checked: event.target.checked } : each,
                        ),
                      }))
                    }
                  />
                  <span>
                    {texts.programme(item.row)}
                    {item.replaces && <span className="hint"> ({texts.replaces})</span>}
                  </span>
                </label>
              ))}
            </fieldset>
          ) : (
            <p className="hint">{texts.programmesNeedKind(choices.programmes.length)}</p>
          ))}
        {refused.length > 0 && <p className="hint">{texts.refused(refused.join(', '))}</p>}
        <p className="hint">{texts.spent(spent)}</p>
        <div className="actions">
          {!nothing && (
            <button
              type="button"
              className="primary"
              onClick={() => {
                onApply(
                  applyChoices(values, {
                    fields: choices.fields,
                    programmes: withProgrammes ? choices.programmes : [],
                  }),
                );
                setState({ kind: 'idle', note: texts.applied });
              }}
            >
              {texts.apply}
            </button>
          )}
          <button
            type="button"
            className="secondary"
            onClick={() => setState({ kind: 'idle', note: null })}
          >
            {texts.discard}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="equipment-photos">
      <h3>{texts.title}</h3>
      <p className="hint">{texts.intro(MAX_EQUIPMENT_PHOTOS)}</p>
      {state.kind === 'confirm' ? (
        <div className="actions">
          <span>{texts.confirm(state.photos.length, state.cost)}</span>
          <button type="button" className="primary" onClick={() => void send(state.photos)}>
            {texts.send}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => setState({ kind: 'idle', note: null })}
          >
            {texts.cancel}
          </button>
        </div>
      ) : state.kind === 'preparing' || state.kind === 'busy' ? (
        <p aria-live="polite">{state.kind === 'busy' ? texts.busy : texts.preparing}</p>
      ) : (
        <>
          {picker}
          {state.kind === 'error' && (
            <p className="error" role="alert">
              {state.text}
            </p>
          )}
          {state.kind === 'idle' && state.note !== null && (
            <p className="hint" aria-live="polite">
              {state.note}
            </p>
          )}
        </>
      )}
    </section>
  );
}
