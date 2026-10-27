// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The chat in the panel ChatDock opens on every page: questions about the
 * house answered by the AI with the tools (src/ai/chat.ts), on the numbers the
 * app computes. Shows the estimated cost before sending (unless the user chose
 * otherwise), the tools each answer used with their results, and any quantity
 * the tools did not give. The suggested questions follow the page; the AI is
 * told its name. Without a key the panel says how to add one; the rest of the
 * app does not need it.
 */
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { askWattometro, estimateChat, type ChatResult } from '../ai/chat';
import { formatMicroUsd } from '../ai/models';
import { AiError, type AiEstimate, type ChatHistory } from '../ai/provider';
import { providerFromSettings, recordUsage } from '../ai/settings';
import { useAiSettings } from './ai-sync';
import { t } from '../i18n/pt-PT';
import { lisbonToday } from '../lib/time';
import { toolContext } from './ai-context';
import { aiErrorText } from './ai-errors';
import type { ChatPage } from './chat-page';
import { useHouseholdEnergy } from './household-energy';
import { useSession } from './session';
import { useWeather } from './use-weather';

const texts = t.ask;
export const CHAT_TITLE_ID = 'chat-title';

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

export function ChatPanel({
  page,
  open,
  onClose,
}: {
  page: ChatPage;
  /** Kept mounted while closed, so the conversation survives. */
  open: boolean;
  onClose: () => void;
}) {
  const { me } = useSession();
  // Read again when they change (Definições, or the account's copy arriving).
  const settings = useAiSettings(me.email);
  const provider = providerFromSettings(settings);
  const energy = useHouseholdEnergy();
  const [today] = useState(lisbonToday);
  const weather = useWeather(today);
  const context = toolContext(energy, weather, me.householdId);

  const [question, setQuestion] = useState('');
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [history, setHistory] = useState<ChatHistory>([]);
  const [pending, setPending] = useState<{ question: string; estimate: AiEstimate } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  // The box follows the text up to three lines (index.css caps it; then it scrolls).
  useLayoutEffect(() => {
    const box = input.current;
    if (!box) return;
    box.style.height = 'auto';
    box.style.height = `${box.scrollHeight}px`;
  }, [question, open]);
  useEffect(() => {
    bottom.current?.scrollIntoView?.({ block: 'end' });
  }, [exchanges.length, pending, busy]);

  async function send(text: string) {
    if (!provider || !context) return;
    setPending(null);
    setBusy(true);
    setError(null);
    try {
      const result = await askWattometro(provider, context, history, text, texts.pages[page]);
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

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = question.trim();
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
    input.current?.focus();
  }

  return (
    <>
      <header className="chat-header">
        <h2 id={CHAT_TITLE_ID}>{texts.title}</h2>
        {exchanges.length > 0 && (
          <button type="button" className="secondary" onClick={restart} disabled={busy}>
            {texts.restart}
          </button>
        )}
        <button type="button" className="chat-close" onClick={onClose} aria-label={texts.close}>
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M6 6l12 12M18 6 6 18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </header>

      {!provider ? (
        <div className="chat-body">
          <p>{texts.noKey}</p>
          <Link to="/definicoes" onClick={onClose}>
            {texts.toSettings}
          </Link>
        </div>
      ) : (
        <>
          <div className="chat-body" aria-live="polite">
            {exchanges.length === 0 && <p className="hint">{texts.intro}</p>}
            {energy.error && <p className="error">{energy.error}</p>}
            {exchanges.map((exchange, index) => (
              <Answer key={index} exchange={exchange} />
            ))}
            {busy && <p className="hint">{texts.thinking}</p>}
            <div ref={bottom} />
          </div>

          <form className="form chat-form" onSubmit={submit}>
            {exchanges.length === 0 && (
              <ul className="choices">
                {texts.suggestions[page].map((suggestion) => (
                  <li key={suggestion}>
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy || !context}
                      onClick={() => {
                        setQuestion(suggestion);
                        setPending(null);
                        input.current?.focus();
                      }}
                    >
                      {suggestion}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {pending && (
              <div className="confirm">
                <p>
                  {texts.estimate(formatMicroUsd(pending.estimate.costMicroUsd), provider.model)}
                </p>
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
            )}
            {/* One line that grows to three (then scrolls), with the send button inside. */}
            <div className="chat-input">
              <label>
                <span className="visually-hidden">
                  {exchanges.length > 0 ? texts.followUp : texts.question}
                </span>
                <textarea
                  ref={input}
                  rows={1}
                  value={question}
                  maxLength={1000}
                  onChange={(event) => {
                    setQuestion(event.target.value);
                    setPending(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder={exchanges.length > 0 ? texts.placeholderFollowUp : texts.placeholder}
                />
              </label>
              <button
                type="submit"
                className="chat-send"
                disabled={busy || !context || pending !== null || question.trim() === ''}
                aria-label={busy ? texts.thinking : !context ? t.loading : texts.ask}
                title={texts.ask}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M4 12 20 4l-4 16-4-7-8-1z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <p className="hint chat-privacy" title={texts.privacy}>
              <span aria-hidden="true">🔒 </span>
              {texts.privacyShort}
            </p>
          </form>
        </>
      )}
    </>
  );
}
