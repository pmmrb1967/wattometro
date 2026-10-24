// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Settings → "A tua instalação": how the house heats, cooks and so on
 * (src/domain/installation.ts). Every answer may stay "Não sei"; the room
 * heating takes several kinds, and "Nenhum" clears the others.
 */
import { useEffect, useState, type FormEvent } from 'react';
import {
  HEATING_KINDS,
  HOB_KINDS,
  WATER_HEATING_KINDS,
  type HeatingKind,
  type Installation,
} from '../domain/installation';
import { t } from '../i18n/pt-PT';
import { fetchHouseholdInstallation, saveHouseholdInstallation } from './api';
import { failureText, useSession } from './session';
import { StatusLine, type Status } from './StatusLine';

const texts = t.settings.installation;

type Flag = 'airConditioning' | 'solarPanels' | 'electricCar';
const FLAGS: readonly Flag[] = ['airConditioning', 'solarPanels', 'electricCar'];

/** Select value for a yes/no/unknown answer. */
const flagValue = (value: boolean | null) => (value === null ? '' : value ? 'yes' : 'no');
const fromFlagValue = (value: string) => (value === '' ? null : value === 'yes');

export function InstallationSection() {
  const { signOut } = useSession();
  const [draft, setDraft] = useState<Installation | undefined>(undefined);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  useEffect(() => {
    let active = true;
    void fetchHouseholdInstallation().then((outcome) => {
      if (!active) return;
      if (outcome.ok) setDraft(outcome.installation);
      else if (outcome.reason === 'unauthenticated') signOut();
      else setStatus({ kind: 'error', text: t.errors.unavailable });
    });
    return () => {
      active = false;
    };
  }, [signOut]);

  if (draft === undefined) {
    return (
      <section className="card form">
        <h2>{texts.title}</h2>
        {status.kind === 'error' ? (
          <StatusLine status={status} />
        ) : (
          <p className="hint">{t.loading}</p>
        )}
      </section>
    );
  }

  const change = (next: Partial<Installation>) => {
    setDraft({ ...draft, ...next });
    setStatus({ kind: 'idle' });
  };

  function toggleHeating(kind: HeatingKind, checked: boolean) {
    const current = draft!.heating ?? [];
    let next: HeatingKind[];
    if (!checked) next = current.filter((k) => k !== kind);
    else if (kind === 'none') next = ['none'];
    else next = HEATING_KINDS.filter((k) => k !== 'none' && (k === kind || current.includes(k)));
    change({ heating: next.length > 0 ? next : null });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus({ kind: 'busy' });
    const outcome = await saveHouseholdInstallation(draft!);
    if (outcome.ok) {
      setStatus({ kind: 'done', text: texts.saved });
      return;
    }
    const text = failureText(outcome, texts.invalid);
    if (text === null) signOut();
    else setStatus({ kind: 'error', text });
  }

  return (
    <section className="card">
      <h2>{texts.title}</h2>
      <p className="hint">{texts.intro}</p>
      <form className="form" onSubmit={(event) => void save(event)}>
        <fieldset>
          <legend>{texts.heating}</legend>
          <p className="hint">{texts.heatingHint}</p>
          {HEATING_KINDS.map((kind) => (
            <label key={kind} className="checkbox">
              <input
                type="checkbox"
                checked={draft.heating?.includes(kind) ?? false}
                onChange={(event) => toggleHeating(kind, event.currentTarget.checked)}
              />
              {texts.heatingKinds[kind]}
            </label>
          ))}
        </fieldset>

        <label>
          {texts.waterHeating}
          <select
            value={draft.waterHeating ?? ''}
            onChange={(event) => {
              const value = event.currentTarget.value;
              change({
                waterHeating: WATER_HEATING_KINDS.find((kind) => kind === value) ?? null,
              });
            }}
          >
            <option value="">{texts.unknown}</option>
            {WATER_HEATING_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {texts.waterHeatingKinds[kind]}
              </option>
            ))}
          </select>
        </label>

        <label>
          {texts.hob}
          <select
            value={draft.hob ?? ''}
            onChange={(event) => {
              const value = event.currentTarget.value;
              change({ hob: HOB_KINDS.find((kind) => kind === value) ?? null });
            }}
          >
            <option value="">{texts.unknown}</option>
            {HOB_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {texts.hobKinds[kind]}
              </option>
            ))}
          </select>
        </label>

        {FLAGS.map((flag) => (
          <label key={flag}>
            {texts.flags[flag]}
            <select
              value={flagValue(draft[flag])}
              onChange={(event) => change({ [flag]: fromFlagValue(event.currentTarget.value) })}
            >
              <option value="">{texts.unknown}</option>
              <option value="yes">{texts.yes}</option>
              <option value="no">{texts.no}</option>
            </select>
          </label>
        ))}

        <StatusLine status={status} />
        <button type="submit" className="primary" disabled={status.kind === 'busy'}>
          {texts.save}
        </button>
      </form>
    </section>
  );
}
