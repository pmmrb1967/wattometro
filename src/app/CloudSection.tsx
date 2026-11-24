// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Settings › Dados, in the local mode: syncing the house through the user's
 * OneDrive, Google Drive or Dropbox (docs/superpowers/specs/2026-11-22-local-cloud-sync-design.md,
 * "Ligar", "Aparelho novo", "Interface"). The work is in src/local/cloud-runner.ts.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { signInToCloud } from '../cloud/cloud-drives';
import {
  availableProviders,
  cloudAvailable,
  providerCompany,
  providerName,
  type CloudProvider,
} from '../cloud/providers';
import { t } from '../i18n/pt-PT';
import { formatLisbonDateTime, formatLocalDate } from '../lib/time';
import { CloudKeyError } from '../local/cloud-files';
import {
  announceCloudChange,
  CLOUD_CHANGED,
  cloudHasHouse,
  cloudStatus,
  linkFirstDevice,
  listCloudBackups,
  readCloudBackup,
  requestSync,
  restoreHouse,
  unlinkCloud,
  type CloudStatus,
} from '../local/cloud-runner';
import {
  clearCloudReturn,
  takeCloudFailure,
  takeCloudReturn,
  type CloudReturn,
} from '../local/cloud-return';
import { cloudFailure } from './cloud-failure';
import { CloudJoin } from './CloudJoin';
import { SecretInput } from './SecretInput';
import { StatusLine, type Status } from './StatusLine';

const texts = t.cloud;

/** Same minimum as the app's sign-in password (server/src/password.ts). */
const MIN_PASSWORD_LENGTH = 12;

type Step =
  | { kind: 'idle' }
  | { kind: 'checking'; provider: CloudProvider }
  | { kind: 'create'; signIn: CloudReturn }
  | { kind: 'recovery'; recoveryKey: string }
  | { kind: 'join'; signIn: CloudReturn };

function useCloudStatus(): CloudStatus | null {
  const [status, setStatus] = useState<CloudStatus | null>(null);
  useEffect(() => {
    let active = true;
    const refresh = () =>
      void cloudStatus().then((next) => {
        if (active) setStatus(next);
      });
    refresh();
    window.addEventListener(CLOUD_CHANGED, refresh);
    return () => {
      active = false;
      window.removeEventListener(CLOUD_CHANGED, refresh);
    };
  }, []);
  return status;
}

function CreateForm({
  signIn,
  onCreated,
  onExists,
  onCancel,
}: {
  signIn: CloudReturn;
  onCreated: (recoveryKey: string) => void;
  onExists: () => void;
  onCancel: () => void;
}) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const form = texts.create;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = String(data.get('password'));
    if (password.length < MIN_PASSWORD_LENGTH) {
      setStatus({ kind: 'error', text: form.tooShort(MIN_PASSWORD_LENGTH) });
      return;
    }
    if (password !== String(data.get('repeat'))) {
      setStatus({ kind: 'error', text: form.mismatch });
      return;
    }
    setStatus({ kind: 'busy' });
    try {
      const { recoveryKey } = await linkFirstDevice(signIn, password);
      onCreated(recoveryKey);
    } catch (error) {
      // Another device linked the folder meanwhile: this one joins it.
      if (error instanceof CloudKeyError && error.code === 'exists') onExists();
      else setStatus({ kind: 'error', text: cloudFailure(error, signIn.provider) });
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <h3>{form.title}</h3>
      <p className="hint">{form.hint(providerCompany(signIn.provider))}</p>
      <SecretInput
        label={form.password(MIN_PASSWORD_LENGTH)}
        showLabel={texts.showPassword}
        hideLabel={texts.hidePassword}
        name="password"
        autoComplete="new-password"
        minLength={MIN_PASSWORD_LENGTH}
        required
      />
      <SecretInput
        label={form.repeat}
        showLabel={texts.showPassword}
        hideLabel={texts.hidePassword}
        name="repeat"
        autoComplete="new-password"
        minLength={MIN_PASSWORD_LENGTH}
        required
      />
      <StatusLine status={status} />
      <div className="actions">
        <button type="submit" className="primary" disabled={status.kind === 'busy'}>
          {status.kind === 'busy' ? form.submitting : form.submit}
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          {texts.cancel}
        </button>
      </div>
    </form>
  );
}

function RecoveryKey({ value, onSaved }: { value: string; onSaved: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = () =>
    void navigator.clipboard.writeText(value).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  return (
    <div>
      <h3>{texts.recovery.title}</h3>
      <p className="hint">{texts.recovery.intro}</p>
      <div className="copy-field">
        <code>{value}</code>
        <button type="button" className="secondary" onClick={copy}>
          {copied ? texts.recovery.copied : texts.recovery.copy}
        </button>
      </div>
      <button type="button" className="primary" onClick={onSaved}>
        {texts.recovery.saved}
      </button>
    </div>
  );
}

function CloudBackups({ service }: { service: string }) {
  const [backups, setBackups] = useState<
    { name: string; day: string; size: number }[] | 'loading' | 'failed'
  >('loading');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const list = texts.backups;

  useEffect(() => {
    let active = true;
    void listCloudBackups().then(
      (next) => {
        if (active) setBackups(next);
      },
      () => {
        if (active) setBackups('failed');
      },
    );
    return () => {
      active = false;
    };
  }, []);

  async function restore(name: string, day: string) {
    if (!window.confirm(list.restoreConfirm(formatLocalDate(day), service))) return;
    setStatus({ kind: 'busy' });
    const data = await readCloudBackup(name).catch(() => null);
    if (data === null) {
      setStatus({ kind: 'error', text: list.unreadable });
      return;
    }
    if (!(await restoreHouse(data))) {
      setStatus({ kind: 'error', text: t.local.data.notKept });
      return;
    }
    // Every page reads the household again; the cycle on start sends it.
    window.location.reload();
  }

  return (
    <>
      <h3>{list.title(service)}</h3>
      {backups === 'loading' ? (
        <p className="hint">{list.loading}</p>
      ) : backups === 'failed' ? (
        <p className="hint">{list.failed}</p>
      ) : backups.length === 0 ? (
        <p className="hint">{list.none}</p>
      ) : (
        <ul className="signature-list">
          {backups.map((backup) => (
            <li key={backup.name}>
              <span>
                {formatLocalDate(backup.day)} ·{' '}
                {list.size(Math.max(1, Math.round(backup.size / 1024)))}
              </span>{' '}
              <button
                type="button"
                className="secondary"
                disabled={status.kind === 'busy'}
                onClick={() => void restore(backup.name, backup.day)}
              >
                {list.restore}
              </button>
            </li>
          ))}
        </ul>
      )}
      <StatusLine status={status} />
    </>
  );
}

function Linked({ status }: { status: Extract<CloudStatus, { linked: true }> }) {
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<Status>({ kind: 'idle' });

  useEffect(() => {
    const done = () => setSyncing(false);
    window.addEventListener(CLOUD_CHANGED, done);
    return () => window.removeEventListener(CLOUD_CHANGED, done);
  }, []);

  const service = providerName(status.provider);
  async function unlink() {
    if (!window.confirm(texts.disconnectConfirm(service))) return;
    if (!(await unlinkCloud({ removeCloud: false }))) {
      setError({ kind: 'error', text: texts.disconnectFailed(service) });
    }
  }

  const when =
    status.lastSyncAt === undefined ? texts.neverSynced : formatLisbonDateTime(status.lastSyncAt);
  return (
    <>
      <p>
        {texts.linked(
          service,
          status.accountLabel ?? texts.someAccount(providerCompany(status.provider)),
          when,
        )}
      </p>
      <div className="actions">
        <button
          type="button"
          className="primary"
          disabled={syncing}
          onClick={() => {
            setSyncing(true);
            requestSync();
          }}
        >
          {syncing ? texts.syncing : texts.syncNow}
        </button>
        <button type="button" className="secondary" onClick={() => void unlink()}>
          {texts.disconnect}
        </button>
      </div>
      <StatusLine status={error} />
      <CloudBackups service={service} />
    </>
  );
}

export function CloudSection() {
  const status = useCloudStatus();
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const [error, setError] = useState<Status>({ kind: 'idle' });
  /** The service whose sign-in page is opening, or whose sign-in failed. */
  const [chosen, setChosen] = useState<CloudProvider | null>(null);

  useEffect(() => {
    if (!cloudAvailable()) return;
    let active = true;
    void (async () => {
      const back = await takeCloudReturn('connect');
      if (back === null) {
        const failed = await takeCloudFailure('connect');
        if (!active || failed === null) return;
        clearCloudReturn('connect');
        setError({ kind: 'error', text: texts.failed(providerName(failed)) });
        return;
      }
      if (!active) return;
      clearCloudReturn('connect');
      setStep({ kind: 'checking', provider: back.provider });
      try {
        const exists = await cloudHasHouse(back);
        if (active) setStep({ kind: exists ? 'join' : 'create', signIn: back });
      } catch (caught) {
        if (!active) return;
        setStep({ kind: 'idle' });
        setError({ kind: 'error', text: cloudFailure(caught, back.provider) });
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Back from the sign-in, the next step is here: open the settings group
  // around it (closed at first), bring it into view and put the cursor in its
  // first field (the cloud password).
  const section = useRef<HTMLElement>(null);
  const shown = status !== null;
  useEffect(() => {
    const here = section.current;
    if (step.kind === 'idle' || here === null) return;
    const group = here.closest('details');
    if (group !== null && !group.open) group.open = true;
    here.scrollIntoView?.({ block: 'start' });
    here.querySelector('input')?.focus({ preventScroll: true });
  }, [step.kind, shown]);

  if (!cloudAvailable() || status === null) return null;

  const idle = () => setStep({ kind: 'idle' });
  const joined = () => {
    announceCloudChange();
    // The house here may now be the cloud's: every page reads it again.
    window.location.reload();
  };

  let body;
  if (step.kind === 'checking') {
    body = <p className="hint">{texts.checking(providerName(step.provider))}</p>;
  } else if (step.kind === 'create') {
    body = (
      <CreateForm
        signIn={step.signIn}
        onCreated={(recoveryKey) => setStep({ kind: 'recovery', recoveryKey })}
        onExists={() => setStep({ kind: 'join', signIn: step.signIn })}
        onCancel={idle}
      />
    );
  } else if (step.kind === 'recovery') {
    body = (
      <RecoveryKey
        value={step.recoveryKey}
        onSaved={() => {
          idle();
          announceCloudChange();
        }}
      />
    );
  } else if (step.kind === 'join') {
    body = <CloudJoin signIn={step.signIn} onDone={joined} onCancel={idle} />;
  } else if (status.linked) {
    body = <Linked status={status} />;
  } else {
    const leaving = error.kind === 'busy';
    body = (
      <>
        <StatusLine status={error} />
        <div className="actions">
          {availableProviders().map((provider) => (
            <button
              key={provider}
              type="button"
              className="primary"
              disabled={leaving}
              onClick={() => {
                setChosen(provider);
                setError({ kind: 'busy' });
                void signInToCloud(provider, 'connect').catch(() =>
                  setError({ kind: 'error', text: texts.failed(providerName(provider)) }),
                );
              }}
            >
              {leaving && chosen === provider
                ? texts.leaving(providerCompany(provider))
                : texts.connect(providerName(provider))}
            </button>
          ))}
        </div>
      </>
    );
  }

  return (
    <section className="card" id="nuvem" ref={section}>
      <h2>{status.linked ? texts.titleLinked(providerName(status.provider)) : texts.title}</h2>
      <p className="hint">{texts.intro}</p>
      {body}
    </section>
  );
}
