// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Settings → "Inteligência artificial": the user's own Anthropic key, the
 * model, and whether to send without showing the cost first. Kept only in
 * this browser (src/ai/settings.ts). The app works without it.
 */
import { useState, type FormEvent } from 'react';
import { AI_MODELS, formatMicroUsd } from '../ai/models';
import {
  forgetAiSettings,
  hasAiKey,
  loadAiSettings,
  providerFromSettings,
  recordUsage,
  saveAiSettings,
  usageThisMonth,
  type AiSettings,
} from '../ai/settings';
import { t } from '../i18n/pt-PT';
import { aiErrorText } from './ai-errors';
import { useSession } from './session';
import { StatusLine, type Status } from './StatusLine';

const texts = t.settings.ai;

export function AiSection() {
  const { me } = useSession();
  const [draft, setDraft] = useState<AiSettings>(() => loadAiSettings(me.email));
  const [saved, setSaved] = useState(() => hasAiKey(loadAiSettings(me.email)));
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [spent, setSpent] = useState(() => usageThisMonth(me.email));

  const change = (next: Partial<AiSettings>) => {
    setDraft({ ...draft, ...next });
    setStatus({ kind: 'idle' });
  };

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const provider = providerFromSettings(draft);
    if (!provider) return;
    setStatus({ kind: 'busy' });
    try {
      const usage = await provider.testConnection();
      saveAiSettings(me.email, draft);
      recordUsage(me.email, [usage]);
      setSpent(usageThisMonth(me.email));
      setSaved(true);
      setStatus({ kind: 'done', text: texts.saved });
    } catch (error) {
      setStatus({ kind: 'error', text: aiErrorText(error) });
    }
  }

  function forget() {
    forgetAiSettings(me.email);
    setDraft(loadAiSettings(me.email));
    setSaved(false);
    setStatus({ kind: 'done', text: texts.forgotten });
  }

  return (
    <section className="card">
      <h2>{texts.title}</h2>
      <p className="hint">{texts.intro}</p>
      <form className="form" onSubmit={(event) => void save(event)}>
        <label>
          {texts.key}
          <input
            name="apiKey"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="sk-ant-…"
            value={draft.apiKey}
            onChange={(event) => change({ apiKey: event.target.value })}
          />
        </label>
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
          <button
            type="submit"
            className="primary"
            disabled={status.kind === 'busy' || !hasAiKey(draft)}
          >
            {status.kind === 'busy' ? texts.testing : texts.save}
          </button>
          {saved && (
            <button type="button" className="secondary" onClick={forget}>
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
