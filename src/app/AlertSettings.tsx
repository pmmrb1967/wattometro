// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Settings → "Avisos": Web Push alerts on this device (docs/alerts.md). Each
 * browser subscribes on its own and chooses which alerts it wants; the
 * Worker checks them every 5 minutes (server/src/alerts.ts).
 */
import { useEffect, useState } from 'react';
import { t } from '../i18n/pt-PT';
import {
  deletePushSubscription,
  fetchPushAlerts,
  fetchPushKey,
  savePushSubscription,
  sendTestPush,
  type Failure,
  type PushAlerts,
} from './api';
import { currentSubscription, PushError, pushSupport, subscribe, subscriptionKeys } from './push';
import { failureText, useSession } from './session';
import { StatusLine, type Status } from './StatusLine';

const texts = t.settings.alerts;
const ALL_ALERTS: PushAlerts = { stale: true, power: true, database: true };
const KINDS = ['stale', 'power', 'database'] as const;

type View =
  | { kind: 'loading' }
  | { kind: 'needsInstall' | 'unsupported' | 'off' }
  | { kind: 'on'; subscription: PushSubscription; alerts: PushAlerts };

export function AlertSection() {
  const { signOut } = useSession();
  const [support] = useState(pushSupport);
  const [view, setView] = useState<View>(() =>
    support === 'supported' ? { kind: 'loading' } : { kind: support },
  );
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const busy = status.kind === 'busy';

  useEffect(() => {
    if (support !== 'supported') return;
    let current = true;
    void (async () => {
      const subscription = await currentSubscription();
      const known = subscription ? await fetchPushAlerts(subscription.endpoint) : null;
      if (!current) return;
      if (subscription && known?.ok && known.alerts) {
        setView({ kind: 'on', subscription, alerts: known.alerts });
      } else {
        setView({ kind: 'off' });
      }
    })();
    return () => {
      current = false;
    };
  }, [support]);

  /** Shows why a request failed; false when the session ended. */
  function failed(failure: Failure, invalid: string) {
    const text = failureText(failure, invalid);
    if (text === null) return signOut();
    setStatus({ kind: 'error', text });
  }

  async function turnOn() {
    setStatus({ kind: 'busy' });
    const key = await fetchPushKey();
    if (!key.ok) return failed(key, texts.notConfigured);
    let subscription: PushSubscription;
    try {
      subscription = await subscribe(key.publicKey);
    } catch (error) {
      const denied = error instanceof PushError && error.reason === 'denied';
      setStatus({ kind: 'error', text: denied ? texts.denied : texts.failed });
      return;
    }
    const saved = await savePushSubscription({
      endpoint: subscription.endpoint,
      keys: subscriptionKeys(subscription),
      alerts: ALL_ALERTS,
    });
    if (!saved.ok) return failed(saved, texts.failed);
    setView({ kind: 'on', subscription, alerts: ALL_ALERTS });
    setStatus({ kind: 'done', text: texts.turnedOn });
  }

  async function choose(subscription: PushSubscription, alerts: PushAlerts) {
    setView({ kind: 'on', subscription, alerts });
    setStatus({ kind: 'busy' });
    const saved = await savePushSubscription({
      endpoint: subscription.endpoint,
      keys: subscriptionKeys(subscription),
      alerts,
    });
    if (!saved.ok) return failed(saved, texts.failed);
    setStatus({ kind: 'done', text: texts.saved });
  }

  async function test(subscription: PushSubscription) {
    setStatus({ kind: 'busy' });
    const sent = await sendTestPush(subscription.endpoint);
    if (!sent.ok) return failed(sent, texts.testFailed);
    setStatus({ kind: 'done', text: texts.testSent });
  }

  async function turnOff(subscription: PushSubscription) {
    setStatus({ kind: 'busy' });
    const removed = await deletePushSubscription(subscription.endpoint);
    if (!removed.ok) return failed(removed, texts.failed);
    await subscription.unsubscribe().catch(() => false);
    setView({ kind: 'off' });
    setStatus({ kind: 'done', text: texts.turnedOff });
  }

  return (
    <section className="card">
      <h2>{texts.title}</h2>
      <p className="hint">{texts.intro}</p>
      {view.kind === 'needsInstall' && <p className="hint">{texts.needsInstall}</p>}
      {view.kind === 'unsupported' && <p className="hint">{texts.unsupported}</p>}
      {view.kind === 'off' && (
        <div className="form">
          <StatusLine status={status} />
          <div className="actions">
            <button type="button" className="primary" disabled={busy} onClick={() => void turnOn()}>
              {texts.turnOn}
            </button>
          </div>
        </div>
      )}
      {view.kind === 'on' && (
        <div className="form">
          <fieldset className="alert-kinds">
            <legend>{texts.which}</legend>
            {KINDS.map((kind) => (
              <label key={kind} className="checkbox">
                <input
                  type="checkbox"
                  checked={view.alerts[kind]}
                  disabled={busy}
                  onChange={(event) =>
                    void choose(view.subscription, {
                      ...view.alerts,
                      [kind]: event.target.checked,
                    })
                  }
                />
                <span>
                  {texts.kinds[kind]}
                  <span className="hint">{texts.kindNotes[kind]}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <StatusLine status={status} />
          <div className="actions">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => void test(view.subscription)}
            >
              {texts.test}
            </button>
            <button
              type="button"
              className="secondary danger"
              disabled={busy}
              onClick={() => void turnOff(view.subscription)}
            >
              {texts.turnOff}
            </button>
          </div>
        </div>
      )}
      <p className="hint">{texts.privacy}</p>
    </section>
  );
}
