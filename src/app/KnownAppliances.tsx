// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * "Calibrar aparelhos" → the appliances the app recognises (Phase 8.3): each
 * with the descriptor it is recognised by, a name that can change and a way to
 * forget it. Named from "Ao segundo" ("O que é?") or from a calibration.
 */
import { useState } from 'react';
import { t } from '../i18n/pt-PT';
import { formatPower } from '../lib/units';
import type { Appliance } from './api';
import { forgetAppliance, renameKnownAppliance, useAppliances } from './appliances-store';
import { failureText, useSession } from './session';

const texts = t.knownAppliances;

function describeAppliance(appliance: Appliance): string {
  return appliance.statesW.length > 1
    ? appliance.statesW.map((watts) => formatPower(watts)).join(' → ')
    : appliance.pulsing
      ? t.dayEvents.pulsing(formatPower(appliance.powerW))
      : formatPower(appliance.powerW);
}

function Row({ appliance }: { appliance: Appliance }) {
  const { signOut } = useSession();
  const [label, setLabel] = useState(appliance.label);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = label.trim() !== '' && label.trim() !== appliance.label;

  async function act(run: () => ReturnType<typeof forgetAppliance>) {
    setBusy(true);
    setError(null);
    const outcome = await run();
    setBusy(false);
    if (outcome.ok) return;
    const text = failureText(outcome, texts.failed);
    if (text === null) return signOut();
    setError(text);
  }

  return (
    <li>
      <div>
        <label>
          <span className="visually-hidden">{texts.name}</span>
          <input
            value={label}
            maxLength={60}
            disabled={busy}
            onChange={(event) => setLabel(event.target.value)}
          />
        </label>
        <span className="hint">{describeAppliance(appliance)}</span>
        {error && <span className="error">{error}</span>}
      </div>
      {changed && (
        <button
          type="button"
          className="primary"
          disabled={busy}
          onClick={() => void act(() => renameKnownAppliance(appliance.id, label.trim()))}
        >
          {texts.rename}
        </button>
      )}
      <button
        type="button"
        className="secondary"
        disabled={busy}
        onClick={() => {
          if (window.confirm(texts.confirmForget(appliance.label))) {
            void act(() => forgetAppliance(appliance.id));
          }
        }}
      >
        {texts.forget}
      </button>
    </li>
  );
}

export function KnownAppliances() {
  const { me } = useSession();
  const known = useAppliances(me.householdId);
  return (
    <section className="card">
      <h2>{texts.title}</h2>
      <p className="hint">{texts.intro}</p>
      {known.kind === 'loading' && <p className="hint">{t.loading}</p>}
      {known.kind === 'error' && <p className="error">{t.errors.unavailable}</p>}
      {known.kind === 'ready' &&
        (known.appliances.length === 0 ? (
          <p className="hint">{texts.empty}</p>
        ) : (
          <ul className="signature-list">
            {known.appliances.map((appliance) => (
              <Row key={appliance.id} appliance={appliance} />
            ))}
          </ul>
        ))}
    </section>
  );
}
