// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Opening a house that already lives in the user's cloud: unlock its key,
 * then join or replace this browser's house. Used by Settings › Dados and by
 * the landing page (a new device).
 */
import { useEffect, useState, type FormEvent } from 'react';
import { providerName } from '../cloud/providers';
import { t } from '../i18n/pt-PT';
import { lisbonToday } from '../lib/time';
import type { CloudReturn } from '../local/cloud-return';
import { cloudHasHouse, joinFromCloud, localHouseHasData } from '../local/cloud-runner';
import { cloudFailure } from './cloud-failure';
import { browserStore } from '../local/store';
import { download } from './download';
import { SecretInput } from './SecretInput';
import { StatusLine, type Status } from './StatusLine';

const texts = t.cloud;

/** A folder that already has a house: unlock its key, and join or replace this browser's. */
export function CloudJoin({
  signIn,
  onDone,
  onCancel,
}: {
  signIn: CloudReturn;
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
    // "Abrir a casa" (nothing here to keep) joins: the same house as replacing, and
    // it also opens a folder whose snapshots cannot be read (replace refuses that).
    const mode =
      !hasData || (submitter instanceof HTMLButtonElement && submitter.value === 'join')
        ? 'join'
        : 'replace';
    const value = String(new FormData(event.currentTarget).get('secret')).trim();
    const secret = byRecovery ? { recoveryKey: value } : { password: value };
    setStatus({ kind: 'busy' });
    try {
      if (mode === 'replace' && hasData) {
        // "Ficar com a da cloud": this browser's house is kept in a file first.
        const read = await browserStore.load();
        if (read.kind === 'ok') download(read.data, t.local.data.fileName(lisbonToday()));
      }
      await joinFromCloud(signIn, secret, mode);
      onDone();
    } catch (error) {
      setStatus({ kind: 'error', text: cloudFailure(error, signIn.provider) });
    }
  }

  const busy = status.kind === 'busy';
  return (
    <form className="form" onSubmit={submit}>
      <h3>{form.title(providerName(signIn.provider))}</h3>
      <p className="hint">{form.intro}</p>
      {byRecovery ? (
        <label>
          {form.recoveryKey}
          <input key="recovery" name="secret" type="text" autoComplete="off" required />
        </label>
      ) : (
        <SecretInput
          key="password"
          label={form.password}
          showLabel={texts.showPassword}
          hideLabel={texts.hidePassword}
          name="secret"
          autoComplete="current-password"
          required
        />
      )}
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
            value="join"
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

/**
 * A new device, back from the cloud sign-in on the landing page: looks at the
 * folder, then asks for the key. A folder without a house is never started here
 * (that is Settings › Dados, once the local mode is in use).
 */
export function LandingJoin({
  signIn,
  onDone,
  onCancel,
}: {
  signIn: CloudReturn;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [found, setFound] = useState<'checking' | 'house' | 'empty' | 'failed'>('checking');

  useEffect(() => {
    let active = true;
    cloudHasHouse(signIn).then(
      (exists) => {
        if (active) setFound(exists ? 'house' : 'empty');
      },
      () => {
        if (active) setFound('failed');
      },
    );
    return () => {
      active = false;
    };
  }, [signIn]);

  if (found === 'house') return <CloudJoin signIn={signIn} onDone={onDone} onCancel={onCancel} />;
  const service = providerName(signIn.provider);
  const message =
    found === 'checking'
      ? texts.checking(service)
      : found === 'empty'
        ? texts.landingJoin.noHouse(service)
        : texts.failed(service);
  return (
    <div className="form">
      <p className="hint" role={found === 'checking' ? 'status' : 'alert'}>
        {message}
      </p>
      {found !== 'checking' && (
        <div className="actions">
          {found === 'empty' && (
            <button type="button" className="primary" onClick={onDone}>
              {t.local.title}
            </button>
          )}
          <button type="button" className="secondary" onClick={onCancel}>
            {texts.cancel}
          </button>
        </div>
      )}
    </div>
  );
}
