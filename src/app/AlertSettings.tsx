// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Settings → "Avisos": Web Push alerts on this device (docs/alerts.md). Each
 * browser subscribes on its own and chooses which alerts it wants; the
 * Worker checks them every 5 minutes (server/src/alerts.ts).
 */
import { useEffect, useState } from 'react';
import { tierBelow, TIERS_VA } from '../domain/contracted-power';
import { t } from '../i18n/pt-PT';
import { lisbonToday } from '../lib/time';
import { formatKva } from '../lib/units';
import {
  DEFAULT_PUSH_OPTIONS,
  deletePushSubscription,
  fetchPushAlerts,
  fetchPushKey,
  fetchTariffs,
  savePushSubscription,
  sendTestPush,
  type Failure,
  type PushAlerts,
  type PushOptions,
} from './api';
import { currentSubscription, PushError, pushSupport, subscribe, subscriptionKeys } from './push';
import { failureText, useSession } from './session';
import { StatusLine, type Status } from './StatusLine';

const texts = t.settings.alerts;
// The cheap hours only matter with a price per hour, the reminders to those who use them:
// asked for, not on by default.
const ALL_ALERTS: PushAlerts = {
  stale: true,
  power: true,
  database: true,
  cheapHours: false,
  eredesImport: false,
  tariffReview: false,
  budget: false,
  unusualDay: false,
  backup: false,
  tierTrip: false,
};
const KINDS = [
  'stale',
  'power',
  'tierTrip',
  'database',
  'cheapHours',
  'eredesImport',
  'tariffReview',
  'budget',
  'unusualDay',
  'backup',
] as const;

type View =
  | { kind: 'loading' }
  | { kind: 'needsInstall' | 'unsupported' | 'off' }
  | { kind: 'on'; subscription: PushSubscription; alerts: PushAlerts; options: PushOptions };

export function AlertSection() {
  const { signOut } = useSession();
  const [support] = useState(pushSupport);
  const [view, setView] = useState<View>(() =>
    support === 'supported' ? { kind: 'loading' } : { kind: support },
  );
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const busy = status.kind === 'busy';
  /** The contracted power today, to name it in the tiers and choose the one below. */
  const [contractedVa, setContractedVa] = useState<number | null>(null);

  useEffect(() => {
    let current = true;
    void fetchTariffs().then((outcome) => {
      if (!current || !outcome.ok) return;
      const today = lisbonToday();
      const tariff = outcome.tariffs.filter((item) => item.validFrom <= today).at(-1);
      setContractedVa(tariff?.powerVa ?? null);
    });
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    if (support !== 'supported') return;
    let current = true;
    void (async () => {
      const subscription = await currentSubscription();
      const known = subscription ? await fetchPushAlerts(subscription.endpoint) : null;
      if (!current) return;
      if (subscription && known?.ok && known.alerts) {
        setView({ kind: 'on', subscription, alerts: known.alerts, options: known.options });
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
      options: DEFAULT_PUSH_OPTIONS,
    });
    if (!saved.ok) return failed(saved, texts.failed);
    setView({ kind: 'on', subscription, alerts: ALL_ALERTS, options: DEFAULT_PUSH_OPTIONS });
    setStatus({ kind: 'done', text: texts.turnedOn });
  }

  async function choose(subscription: PushSubscription, alerts: PushAlerts, options: PushOptions) {
    // Turning on the simulation without a tier yet: the one below the contract.
    const chosen =
      alerts.tierTrip && options.tierVa === null
        ? { ...options, tierVa: tierBelow(contractedVa) }
        : options;
    setView({ kind: 'on', subscription, alerts, options: chosen });
    setStatus({ kind: 'busy' });
    const saved = await savePushSubscription({
      endpoint: subscription.endpoint,
      keys: subscriptionKeys(subscription),
      alerts,
      options: chosen,
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
                    void choose(
                      view.subscription,
                      { ...view.alerts, [kind]: event.target.checked },
                      view.options,
                    )
                  }
                />
                <span>
                  {texts.kinds[kind]}
                  <span className="hint">{texts.kindNotes[kind]}</span>
                  {kind === 'power' && view.alerts.power && (
                    <select
                      aria-label={texts.powerLevel}
                      value={view.options.powerPct}
                      disabled={busy}
                      onChange={(event) =>
                        void choose(view.subscription, view.alerts, {
                          ...view.options,
                          powerPct: event.target.value === '100' ? 100 : 120,
                        })
                      }
                    >
                      {([120, 100] as const).map((pct) => (
                        <option key={pct} value={pct}>
                          {texts.powerLevels[pct]}
                        </option>
                      ))}
                    </select>
                  )}
                  {kind === 'tierTrip' && view.alerts.tierTrip && (
                    <select
                      aria-label={texts.tier}
                      value={view.options.tierVa ?? tierBelow(contractedVa)}
                      disabled={busy}
                      onChange={(event) =>
                        void choose(view.subscription, view.alerts, {
                          ...view.options,
                          tierVa: Number(event.target.value),
                        })
                      }
                    >
                      {TIERS_VA.map((va) => (
                        <option key={va} value={va}>
                          {va === contractedVa ? texts.tierCurrent(formatKva(va)) : formatKva(va)}
                        </option>
                      ))}
                    </select>
                  )}
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
