// SPDX-License-Identifier: AGPL-3.0-or-later
import { AdminSection } from './AdminStats';
import { AiSection } from './AiSettings';
import { AlertSection } from './AlertSettings';
import { useState, type FormEvent } from 'react';
import { InstallSection } from '../components/InstallSection';
import { t } from '../i18n/pt-PT';
import { SettingsGroup } from './SettingsGroup';
import { ThemeSection } from './ThemeSection';
import { changePassword, renameHousehold } from './api';
import { DevicesSection } from './Devices';
import { EredesImportSection } from './EredesImport';
import { InstallationSection } from './Installation';
import { LocationSection } from './Location';
import { failureText, useSession } from './session';
import { StatusLine, type Status } from './StatusLine';
import { TariffSection } from './Tariff';

/** Same minimum as the server (server/src/password.ts), checked here for a quicker message. */
const MIN_PASSWORD_LENGTH = 12;

function HouseholdForm() {
  const { me, update, signOut } = useSession();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get('name')).trim();
    setStatus({ kind: 'busy' });
    const outcome = await renameHousehold(name);
    if (outcome.ok) {
      update(outcome.me);
      setStatus({ kind: 'done', text: t.settings.household.saved });
      return;
    }
    const text = failureText(outcome, t.settings.household.invalid);
    if (text === null) signOut();
    else setStatus({ kind: 'error', text });
  }

  return (
    <form className="card form" onSubmit={submit}>
      <h2>{t.settings.household.title}</h2>
      <label>
        {t.settings.household.name}
        <input name="name" defaultValue={me.householdName} maxLength={60} required />
      </label>
      <StatusLine status={status} />
      <button type="submit" className="primary" disabled={status.kind === 'busy'}>
        {status.kind === 'busy' ? t.settings.household.saving : t.settings.household.save}
      </button>
    </form>
  );
}

function PasswordForm() {
  const { me, signOut } = useSession();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const texts = t.settings.password;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const current = String(form.get('current'));
    const next = String(form.get('next'));
    if (next.length < MIN_PASSWORD_LENGTH) {
      setStatus({ kind: 'error', text: texts.tooShort(MIN_PASSWORD_LENGTH) });
      return;
    }
    if (next !== String(form.get('repeat'))) {
      setStatus({ kind: 'error', text: texts.mismatch });
      return;
    }
    setStatus({ kind: 'busy' });
    const outcome = await changePassword(current, next);
    if (outcome.ok) {
      formElement.reset();
      setStatus({ kind: 'done', text: texts.done });
      return;
    }
    const text = failureText(outcome, texts.wrong);
    if (text === null) signOut();
    else setStatus({ kind: 'error', text });
  }

  return (
    <form className="card form" onSubmit={submit}>
      <h2>{texts.title}</h2>
      {/* Lets password managers attach the new password to the right account. */}
      <input type="email" autoComplete="username" hidden readOnly value={me.email} />
      <label>
        {texts.current}
        <input name="current" type="password" autoComplete="current-password" required />
      </label>
      <label>
        {texts.next(MIN_PASSWORD_LENGTH)}
        <input
          name="next"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
        />
      </label>
      <label>
        {texts.repeat}
        <input
          name="repeat"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
        />
      </label>
      <StatusLine status={status} />
      <button type="submit" className="primary" disabled={status.kind === 'busy'}>
        {status.kind === 'busy' ? texts.submitting : texts.submit}
      </button>
    </form>
  );
}

/** The page's groups, most used first: [id, name]. */
const GROUPS = t.settings.groups;

export function Settings() {
  const { me, signOut } = useSession();
  return (
    <>
      <h1>{t.settings.title}</h1>
      <nav className="toc" aria-label={t.settings.tocLabel}>
        {(me.admin ? [...GROUPS, t.settings.adminGroup] : GROUPS).map(([id, name]) => (
          <a key={id} href={`#${id}`}>
            {name}
          </a>
        ))}
      </nav>

      <SettingsGroup id="tarifario" name={GROUPS[0][1]}>
        <TariffSection />
      </SettingsGroup>
      <SettingsGroup id="dados" name={GROUPS[1][1]}>
        <EredesImportSection />
        <DevicesSection />
      </SettingsGroup>
      <SettingsGroup id="avisos" name={GROUPS[2][1]}>
        <AlertSection />
      </SettingsGroup>
      <SettingsGroup id="ia" name={GROUPS[3][1]}>
        <AiSection />
      </SettingsGroup>
      <SettingsGroup id="casa" name={GROUPS[4][1]}>
        <HouseholdForm />
        <LocationSection />
        <InstallationSection />
      </SettingsGroup>
      <SettingsGroup id="conta" name={GROUPS[5][1]}>
        <section className="card">
          <h2>{t.settings.account.title}</h2>
          <p>{t.settings.account.signedInAs(me.email)}</p>
          <p className="hint">{t.settings.account.sessionNote}</p>
          <button type="button" className="secondary" onClick={signOut}>
            {t.settings.account.logout}
          </button>
        </section>
        <PasswordForm />
        <ThemeSection />
        <InstallSection />
      </SettingsGroup>
      {me.admin && (
        <SettingsGroup id={t.settings.adminGroup[0]} name={t.settings.adminGroup[1]}>
          <AdminSection />
        </SettingsGroup>
      )}
    </>
  );
}
