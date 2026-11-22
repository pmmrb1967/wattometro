// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Settings › Dados, in the local mode: syncing the house through the user's
 * OneDrive (docs/superpowers/specs/2026-11-22-local-cloud-sync-design.md,
 * "Ligar", "Aparelho novo", "Interface"). The work is in src/local/cloud-runner.ts.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { signInToOneDrive } from '../cloud/onedrive-auth';
import { oneDriveAvailable } from '../cloud/providers';
import { t } from '../i18n/pt-PT';
import { formatLisbonDateTime, formatLocalDate, lisbonToday } from '../lib/time';
import { CloudKeyError } from '../local/cloud-files';
import {
  announceCloudChange,
  CLOUD_CHANGED,
  cloudHasHouse,
  cloudStatus,
  joinFromCloud,
  linkFirstDevice,
  listCloudBackups,
  localHouseHasData,
  readCloudBackup,
  requestSync,
  restoreHouse,
  unlinkCloud,
  type CloudStatus,
} from '../local/cloud-runner';
import { takeCloudReturn } from '../local/cloud-return';
import { CloudSyncError } from '../local/cloud-sync';
import { browserStore } from '../local/store';
import { download } from './download';
import { StatusLine, type Status } from './StatusLine';

const texts = t.cloud;

/** Same minimum as the app's sign-in password (server/src/password.ts). */
const MIN_PASSWORD_LENGTH = 12;

type Step =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'create'; accountId: string }
  | { kind: 'recovery'; recoveryKey: string }
  | { kind: 'join'; accountId: string };

function failure(error: unknown): string {
  if (error instanceof CloudKeyError && error.code === 'wrong_secret')
    return texts.join.wrongSecret;
  if (error instanceof CloudSyncError) {
    return error.code === 'newer_app' ? texts.newerApp : texts.unreadableHouse;
  }
  return texts.failed;
}

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
  accountId,
  onCreated,
  onExists,
  onCancel,
}: {
  accountId: string;
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
      const { recoveryKey } = await linkFirstDevice(accountId, password);
      onCreated(recoveryKey);
    } catch (error) {
      // Another device linked the folder meanwhile: this one joins it.
      if (error instanceof CloudKeyError && error.code === 'exists') onExists();
      else setStatus({ kind: 'error', text: failure(error) });
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <h3>{form.title}</h3>
      <p className="hint">{form.hint}</p>
      <label>
        {form.password(MIN_PASSWORD_LENGTH)}
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
        />
      </label>
      <label>
        {form.repeat}
        <input
          name="repeat"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
        />
      </label>
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

/** A folder that already has a house: unlock its key, and join or replace this browser's. */
export function CloudJoin({
  accountId,
  onDone,
  onCancel,
}: {
  accountId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [byRecovery, setByRecovery] = useState(false);
  const [hasData, setHasData] = useState<boolean | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const form = texts.join;

  useEffect(() => {
    let active = true;
    void localHouseHasData().then((has) => {
      if (active) setHasData(has);
    });
    return () => {
      active = false;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const mode =
      submitter instanceof HTMLButtonElement && submitter.value === 'join' ? 'join' : 'replace';
    const value = String(new FormData(event.currentTarget).get('secret')).trim();
    const secret = byRecovery ? { recoveryKey: value } : { password: value };
    setStatus({ kind: 'busy' });
    try {
      if (mode === 'replace' && hasData) {
        // "Ficar com a da cloud": this browser's house is kept in a file first.
        const read = await browserStore.load();
        if (read.kind === 'ok') download(read.data, t.local.data.fileName(lisbonToday()));
      }
      await joinFromCloud(accountId, secret, mode);
      onDone();
    } catch (error) {
      setStatus({ kind: 'error', text: failure(error) });
    }
  }

  const busy = status.kind === 'busy';
  return (
    <form className="form" onSubmit={submit}>
      <h3>{form.title}</h3>
      <p className="hint">{form.intro}</p>
      <label>
        {byRecovery ? form.recoveryKey : form.password}
        <input
          key={byRecovery ? 'recovery' : 'password'}
          name="secret"
          type={byRecovery ? 'text' : 'password'}
          autoComplete={byRecovery ? 'off' : 'current-password'}
          required
        />
      </label>
      <button type="button" className="link-button" onClick={() => setByRecovery(!byRecovery)}>
        {byRecovery ? form.usePassword : form.useRecovery}
      </button>
      {hasData && <p className="hint">{form.bothHouses}</p>}
      <StatusLine status={status} />
      <div className="actions">
        {hasData ? (
          <>
            <button type="submit" name="mode" value="join" className="primary" disabled={busy}>
              {busy ? form.working : form.join}
            </button>
            <button type="submit" name="mode" value="replace" className="secondary" disabled={busy}>
              {form.keepCloud}
            </button>
          </>
        ) : (
          <button
            type="submit"
            name="mode"
            value="replace"
            className="primary"
            disabled={busy || hasData === null}
          >
            {busy ? form.working : form.open}
          </button>
        )}
        <button type="button" className="secondary" onClick={onCancel}>
          {texts.cancel}
        </button>
      </div>
    </form>
  );
}

function CloudBackups() {
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
    if (!window.confirm(list.restoreConfirm(formatLocalDate(day)))) return;
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
      <h3>{list.title}</h3>
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

  async function unlink() {
    if (!window.confirm(texts.disconnectConfirm)) return;
    if (!(await unlinkCloud({ removeCloud: false }))) {
      setError({ kind: 'error', text: texts.disconnectFailed });
    }
  }

  const when =
    status.lastSyncAt === undefined ? texts.neverSynced : formatLisbonDateTime(status.lastSyncAt);
  return (
    <>
      <p>{texts.linked(status.accountLabel ?? texts.someAccount, when)}</p>
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
      <CloudBackups />
    </>
  );
}

export function CloudSection() {
  const status = useCloudStatus();
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const [error, setError] = useState<Status>({ kind: 'idle' });

  useEffect(() => {
    if (!oneDriveAvailable()) return;
    let active = true;
    void (async () => {
      const back = await takeCloudReturn('connect');
      if (!active || back === null) return;
      setStep({ kind: 'checking' });
      try {
        const exists = await cloudHasHouse(back.accountId);
        if (active) setStep({ kind: exists ? 'join' : 'create', accountId: back.accountId });
      } catch (caught) {
        if (!active) return;
        setStep({ kind: 'idle' });
        setError({ kind: 'error', text: failure(caught) });
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (!oneDriveAvailable() || status === null) return null;

  const idle = () => setStep({ kind: 'idle' });
  const joined = () => {
    announceCloudChange();
    // The house here may now be the cloud's: every page reads it again.
    window.location.reload();
  };

  let body;
  if (step.kind === 'checking') {
    body = <p className="hint">{texts.checking}</p>;
  } else if (step.kind === 'create') {
    body = (
      <CreateForm
        accountId={step.accountId}
        onCreated={(recoveryKey) => setStep({ kind: 'recovery', recoveryKey })}
        onExists={() => setStep({ kind: 'join', accountId: step.accountId })}
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
    body = <CloudJoin accountId={step.accountId} onDone={joined} onCancel={idle} />;
  } else if (status.linked) {
    body = <Linked status={status} />;
  } else {
    body = (
      <>
        <StatusLine status={error} />
        <button
          type="button"
          className="primary"
          disabled={error.kind === 'busy'}
          onClick={() => {
            setError({ kind: 'busy' });
            void signInToOneDrive('connect').catch(() =>
              setError({ kind: 'error', text: texts.failed }),
            );
          }}
        >
          {error.kind === 'busy' ? texts.leaving : texts.connect}
        </button>
      </>
    );
  }

  return (
    <section className="card" id="onedrive">
      <h2>{texts.title}</h2>
      <p className="hint">{texts.intro}</p>
      {body}
    </section>
  );
}
