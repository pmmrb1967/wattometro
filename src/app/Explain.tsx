// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * "Explicar": asks the AI to tell facts the app computed in plain words
 * (src/ai/explain.ts), after showing the estimated cost unless the user chose
 * to send straight away. Nothing is shown without a key: the page works
 * without it.
 */
import { useState } from 'react';
import { estimateExplain, explainFacts, type ExplainResult } from '../ai/explain';
import { formatMicroUsd } from '../ai/models';
import type { ExplainSubject } from '../ai/prompts/explain';
import { AiError } from '../ai/provider';
import { providerFromSettings, recordUsage } from '../ai/settings';
import { useAiSettings } from './ai-sync';
import { t } from '../i18n/pt-PT';
import { aiErrorText } from './ai-errors';
import { useSession } from './session';

const texts = t.explain;

type State =
  | { kind: 'idle' }
  | { kind: 'confirm'; cost: string }
  | { kind: 'busy' }
  | { kind: 'done'; result: ExplainResult }
  | { kind: 'error'; text: string };

export function ExplainButton({
  subject,
  facts,
}: {
  subject: ExplainSubject;
  /** Called when the user asks: the facts as the tools give them. */
  facts: () => unknown;
}) {
  const { me } = useSession();
  const settings = useAiSettings(me.email);
  const provider = providerFromSettings(settings);
  const [state, setState] = useState<State>({ kind: 'idle' });
  if (!provider) return null;

  async function send() {
    if (!provider) return;
    setState({ kind: 'busy' });
    try {
      const result = await explainFacts(provider, subject, facts());
      recordUsage(me.email, result.usage);
      setState({ kind: 'done', result });
    } catch (error) {
      if (error instanceof AiError) recordUsage(me.email, error.usage);
      setState({ kind: 'error', text: aiErrorText(error) });
    }
  }

  function ask() {
    if (!provider) return;
    if (settings.autoSend) void send();
    else {
      const estimate = estimateExplain(provider.model, subject, facts());
      setState({ kind: 'confirm', cost: formatMicroUsd(estimate.costMicroUsd) });
    }
  }

  if (state.kind === 'done') {
    const { explanation, unconfirmed, usage } = state.result;
    const cost = usage.reduce((sum, item) => sum + item.costMicroUsd, 0);
    return (
      <div className="explanation">
        <h3>{texts.title}</h3>
        <p>
          <strong>{explanation.headline}</strong>
        </p>
        {explanation.points.length > 0 && (
          <ul>
            {explanation.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        )}
        {explanation.actions.length > 0 && (
          <>
            <p>{texts.actions}</p>
            <ul>
              {explanation.actions.map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ul>
          </>
        )}
        {unconfirmed.length > 0 && (
          <p className="error" role="alert">
            {t.ask.unconfirmed(unconfirmed.join(', '))}
          </p>
        )}
        <p className="hint">{texts.note(formatMicroUsd(cost))}</p>
      </div>
    );
  }

  return (
    <div className="explanation">
      {state.kind === 'confirm' ? (
        <div className="confirm">
          <p>{texts.estimate(state.cost)}</p>
          <div className="actions">
            <button type="button" className="primary" onClick={() => void send()}>
              {t.ask.send}
            </button>
            <button type="button" className="secondary" onClick={() => setState({ kind: 'idle' })}>
              {t.ask.cancel}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="secondary" disabled={state.kind === 'busy'} onClick={ask}>
          {state.kind === 'busy' ? t.ask.thinking : texts.button}
        </button>
      )}
      {state.kind === 'error' && (
        <p className="error" role="alert">
          {state.text}
        </p>
      )}
    </div>
  );
}
