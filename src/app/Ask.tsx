// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * "Perguntar": questions about the house answered by the AI with the tools
 * (src/ai/chat.ts), on the numbers the app computes. Shows the estimated cost
 * before sending (unless the user chose otherwise), the tools each answer
 * used with their results, and any quantity the tools did not give. Without
 * a key the page says how to add one; the rest of the app does not need it.
 */
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { askWattometro, estimateChat, type ChatResult } from '../ai/chat';
import { formatMicroUsd } from '../ai/models';
import { AiError, type AiEstimate, type ChatHistory } from '../ai/provider';
import { loadAiSettings, providerFromSettings, recordUsage } from '../ai/settings';
import { t } from '../i18n/pt-PT';
import { lisbonToday } from '../lib/time';
import { toolContext } from './ai-context';
import { aiErrorText } from './ai-errors';
import { useHouseholdEnergy } from './household-energy';
import { useSession } from './session';
import { useWeather } from './use-weather';

const texts = t.ask;

interface Exchange {
  question: string;
  result: ChatResult;
}

const costOf = (result: ChatResult) =>
  result.usage.reduce((sum, usage) => sum + usage.costMicroUsd, 0);

function Answer({ exchange }: { exchange: Exchange }) {
  const { result } = exchange;
  return (
    <article className="chat-answer">
      <p className="chat-question">{exchange.question}</p>
      <p className="chat-text">{result.text}</p>
      {result.unconfirmed.length > 0 && (
        <p className="error" role="alert">
          {texts.unconfirmed(result.unconfirmed.join(', '))}
        </p>
      )}
      {result.calls.length > 0 && (
        <details>
          <summary>
            {texts.used(
              [...new Set(result.calls.map((call) => texts.tools[call.name] ?? call.name))].join(
                ', ',
              ),
            )}
          </summary>
          {result.calls.map((call, index) => (
            <pre key={index} className="chat-tool">
              {JSON.stringify(call.outcome.ok ? call.outcome.result : call.outcome, null, 2)}
            </pre>
          ))}
        </details>
      )}
      <p className="hint">{texts.cost(formatMicroUsd(costOf(result)))}</p>
    </article>
  );
}

export function Ask() {
  const { me } = useSession();
  const [settings] = useState(() => loadAiSettings(me.email));
  const provider = providerFromSettings(settings);
  const energy = useHouseholdEnergy();
  const [today] = useState(lisbonToday);
  const weather = useWeather(today);
  const context = toolContext(energy, weather);

  const [question, setQuestion] = useState('');
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [history, setHistory] = useState<ChatHistory>([]);
  const [pending, setPending] = useState<{ question: string; estimate: AiEstimate } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const header = (
    <>
      <h1>{texts.title}</h1>
      <p className="lead">{texts.intro}</p>
    </>
  );

  if (!provider) {
    return (
      <>
        {header}
        <section className="card">
          <p>{texts.noKey}</p>
          <Link to="/definicoes">{texts.toSettings}</Link>
        </section>
      </>
    );
  }

  async function send(text: string) {
    if (!provider || !context) return;
    setPending(null);
    setBusy(true);
    setError(null);
    try {
      const result = await askWattometro(provider, context, history, text);
      recordUsage(me.email, result.usage);
      setHistory(result.history);
      setExchanges((list) => [...list, { question: text, result }]);
      setQuestion('');
    } catch (failure) {
      if (failure instanceof AiError) recordUsage(me.email, failure.usage);
      setError(aiErrorText(failure));
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>, text = question) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || !provider) return;
    if (settings.autoSend) void send(trimmed);
    else
      setPending({ question: trimmed, estimate: estimateChat(provider.model, history, trimmed) });
  }

  function restart() {
    setExchanges([]);
    setHistory([]);
    setPending(null);
    setError(null);
  }

  return (
    <>
      {header}
      {energy.error && <p className="error">{energy.error}</p>}
      {exchanges.length > 0 && (
        <section className="card chat">
          {exchanges.map((exchange, index) => (
            <Answer key={index} exchange={exchange} />
          ))}
          <button type="button" className="secondary" onClick={restart} disabled={busy}>
            {texts.restart}
          </button>
        </section>
      )}

      <section className="card">
        <form className="form" onSubmit={submit}>
          <label>
            {exchanges.length > 0 ? texts.followUp : texts.question}
            <textarea
              rows={3}
              value={question}
              maxLength={1000}
              onChange={(event) => {
                setQuestion(event.target.value);
                setPending(null);
              }}
              placeholder={texts.placeholder}
            />
          </label>
          {exchanges.length === 0 && (
            <ul className="choices">
              {texts.examples.map((example) => (
                <li key={example}>
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy || !context}
                    onClick={() => setQuestion(example)}
                  >
                    {example}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {pending ? (
            <div className="confirm">
              <p>{texts.estimate(formatMicroUsd(pending.estimate.costMicroUsd), provider.model)}</p>
              <div className="actions">
                <button
                  type="button"
                  className="primary"
                  onClick={() => void send(pending.question)}
                >
                  {texts.send}
                </button>
                <button type="button" className="secondary" onClick={() => setPending(null)}>
                  {texts.cancel}
                </button>
              </div>
            </div>
          ) : (
            <div className="actions">
              <button
                type="submit"
                className="primary"
                disabled={busy || !context || question.trim() === ''}
              >
                {busy ? texts.thinking : !context ? t.loading : texts.ask}
              </button>
            </div>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </form>
        <p className="hint">{texts.privacy}</p>
      </section>
    </>
  );
}
