// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Settings → "Inteligência artificial": the user's own Anthropic key, the
 * model, and whether to send without showing the cost first. Kept in the
 * account, the key sealed by the server, and copied to each browser
 * (src/app/ai-sync.ts). The app works without it.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { AI_MODELS, formatMicroUsd } from '../ai/models';
import {
  hasAiKey,
  loadAiSettings,
  providerFromSettings,
  recordUsage,
  usageThisMonth,
  type AiSettings,
} from '../ai/settings';
import { t } from '../i18n/pt-PT';
import { aiErrorText } from './ai-errors';
import { pullAiSettings, removeAiSettings, storeAiSettings, type AiHome } from './ai-sync';
import { failureText, useSession } from './session';
import { StatusLine, type Status } from './StatusLine';

const texts = t.settings.ai;

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      {!open && (
        <path d="M4 20 20 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      )}
    </svg>
  );
}

export function AiSection() {
  const { me, signOut } = useSession();
  const [draft, setDraft] = useState<AiSettings>(() => loadAiSettings(me.email));
  const [saved, setSaved] = useState(() => hasAiKey(loadAiSettings(me.email)));
  const [home, setHome] = useState<AiHome | null>(null);
  const [shown, setShown] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [spent, setSpent] = useState(() => usageThisMonth(me.email));
  const busy = status.kind === 'busy';

  // The account's copy: a key saved on another device appears here.
  useEffect(() => {
    let current = true;
    void pullAiSettings(me.email).then((result) => {
      if (!current) return;
      if (result === null) return signOut();
      setDraft(result.settings);
      setSaved(hasAiKey(result.settings));
      setHome(result.home);
    });
    return () => {
      current = false;
    };
  }, [me.email, signOut]);

  const change = (next: Partial<AiSettings>) => {
    setDraft({ ...draft, ...next });
    setStatus({ kind: 'idle' });
  };

  /** Tries the key with a tiny request; false (and the reason shown) when it does not work. */
  async function tryKey(): Promise<boolean> {
    const provider = providerFromSettings(draft);
    if (!provider) return false;
    setStatus({ kind: 'busy' });
    try {
      recordUsage(me.email, [await provider.testConnection()]);
      setSpent(usageThisMonth(me.email));
      return true;
    } catch (error) {
      setStatus({ kind: 'error', text: aiErrorText(error) });
      return false;
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!(await tryKey())) return;
    const where = await storeAiSettings(me.email, draft);
    setSaved(true);
    setHome(where);
    setStatus({ kind: 'done', text: where === 'account' ? texts.saved : texts.savedHere });
  }

  async function test() {
    if (await tryKey()) setStatus({ kind: 'done', text: texts.works });
  }

  async function forget() {
    if (!window.confirm(texts.forgetConfirm)) return;
    setStatus({ kind: 'busy' });
    const removed = await removeAiSettings(me.email);
    if (!removed.ok) {
      const text = failureText(removed, texts.forgetFailed);
      if (text === null) return signOut();
      setStatus({ kind: 'error', text });
      return;
    }
    setDraft(loadAiSettings(me.email));
    setSaved(false);
    setShown(false);
    setStatus({ kind: 'done', text: texts.forgotten });
  }

  return (
    <section className="card">
      <h2>{texts.title}</h2>
      <p className="hint">{texts.intro}</p>
      <form className="form" onSubmit={(event) => void save(event)}>
        {/* The eye sits over the field, outside the label, so it is not part of the field's name. */}
        <div className="secret-field">
          <label>
            {texts.key}
            <input
              name="apiKey"
              type={shown ? 'text' : 'password'}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="sk-ant-…"
              value={draft.apiKey}
              onChange={(event) => change({ apiKey: event.target.value })}
            />
          </label>
          <button
            type="button"
            className="secret-toggle"
            aria-label={shown ? texts.hideKey : texts.showKey}
            title={shown ? texts.hideKey : texts.showKey}
            aria-pressed={shown}
            onClick={() => setShown(!shown)}
          >
            <EyeIcon open={!shown} />
          </button>
        </div>
        {saved && home !== null && (
          <p className="hint">{home === 'account' ? texts.inAccount : texts.inBrowser}</p>
        )}
        <label>
          {texts.model}
          <select value={draft.model} onChange={(event) => change({ model: event.target.value })}>
            {AI_MODELS.map((model) => (
              <option key={model.id} value={model.id}>
                {texts.modelOption(model.label, model.id)}
              </option>
            ))}
          </select>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={draft.autoSend}
            onChange={(event) => change({ autoSend: event.target.checked })}
          />
          {texts.autoSend}
        </label>
        <p className="hint">{texts.keyNote}</p>
        <StatusLine status={status} />
        <div className="actions">
          <button type="submit" className="primary" disabled={busy || !hasAiKey(draft)}>
            {busy ? texts.working : texts.save}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy || !hasAiKey(draft)}
            onClick={() => void test()}
          >
            {texts.test}
          </button>
          {saved && (
            <button
              type="button"
              className="secondary danger"
              disabled={busy}
              onClick={() => void forget()}
            >
              {texts.forget}
            </button>
          )}
        </div>
      </form>
      {spent.requests > 0 && (
        <p className="hint">{texts.spent(formatMicroUsd(spent.costMicroUsd), spent.requests)}</p>
      )}
    </section>
  );
}
