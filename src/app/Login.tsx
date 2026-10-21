// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState, type FormEvent } from 'react';
import { t } from '../i18n/pt-PT';
import { login, type LoginOutcome, type Me } from './api';

function errorText(outcome: Exclude<LoginOutcome, { ok: true }>): string {
  if (outcome.reason === 'locked') return t.login.locked(Math.ceil(outcome.retryAfter / 60));
  return outcome.reason === 'invalid' ? t.login.invalid : t.login.unavailable;
}

export function Login({ onSignedIn }: { onSignedIn: (me: Me) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    const outcome = await login(String(form.get('email')), String(form.get('password')));
    setBusy(false);
    if (outcome.ok) onSignedIn(outcome.me);
    else setError(errorText(outcome));
  }

  return (
    <form className="login" onSubmit={submit}>
      <h2>{t.login.title}</h2>
      <label>
        {t.login.email}
        <input name="email" type="email" autoComplete="username" required />
      </label>
      <label>
        {t.login.password}
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy}>
        {busy ? t.login.submitting : t.login.submit}
      </button>
      <p className="hint">{t.login.noAccount}</p>
    </form>
  );
}
